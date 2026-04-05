"""
Script liên kết file cũ vào bảng personnel_documents
======================================================
Cách dùng trên server:
    docker exec -it asset_backend python /app/scripts/link_existing_personnel_docs.py \
        --root /app/uploads/personnel/linked/modules/personnel.profile \
        --dry-run        # Xem trước, chưa lưu

    docker exec -it asset_backend python /app/scripts/link_existing_personnel_docs.py \
        --root /app/uploads/personnel/linked/modules/personnel.profile
        # Chạy thật

Cấu trúc thư mục nhận diện (khi root = .../personnel.profile):
    profile/                         → doc_type OTHER  (hồ sơ chung)
    personnel-profile-profile/       → doc_type PROFILE
    personnel-profile-certificate/   → doc_type CERTIFICATE
    appmodelpersonnelprofilecert*/   → doc_type CERTIFICATE
    contract/                        → doc_type CONTRACT
"""

import argparse
import asyncio
import os
import re
import sys
import unicodedata

# Thêm app vào path
sys.path.insert(0, "/app")

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://asset_user:AssetPro2026@postgres:5432/asset_management"
)

# Map pattern thư mục → doc_type (áp dụng cho rel_path kể từ --root)
DIR_TYPE_MAP = [
    (re.compile(r"personnel-profile-profile",           re.I), "PROFILE"),
    (re.compile(r"personnel-profile-certificate",       re.I), "CERTIFICATE"),
    (re.compile(r"appmodel.*certificate",               re.I), "CERTIFICATE"),
    (re.compile(r"personnel[._-]profile[/\\].*profile", re.I), "PROFILE"),
    (re.compile(r"personnel[._-]profile[/\\].*certif",  re.I), "CERTIFICATE"),
    (re.compile(r"personnel[._-]profile",               re.I), "PROFILE"),
    (re.compile(r"contract",                            re.I), "CONTRACT"),
]

ALLOWED_EXT = {".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".doc", ".docx", ".xls", ".xlsx"}

# Pattern timestamp trong tên file: HH.MM.SS-DD.MM.YYYY
_TS_RE = re.compile(r"-\d{2}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{4}")


def _norm(s: str) -> str:
    """Chuẩn hoá: bỏ dấu, lowercase, thay - và _ bằng khoảng trắng."""
    nfkd = unicodedata.normalize("NFKD", s)
    ascii_ = "".join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r"[-_]+", " ", ascii_.lower()).strip()


def guess_doc_type(rel_path: str) -> str:
    norm = rel_path.replace("\\", "/")
    for pattern, dtype in DIR_TYPE_MAP:
        if pattern.search(norm):
            return dtype
    return "OTHER"


def _name_from_filename(fname: str) -> str:
    """Trích tên người từ tên file bằng cách bỏ phần timestamp và extension."""
    base = os.path.splitext(fname)[0]          # bỏ extension
    base = _TS_RE.sub("", base)                # bỏ -HH.MM.SS-DD.MM.YYYY
    base = re.sub(r"\d+$", "", base)           # bỏ số đuôi (v.d. NGUYEN-KIM-CHINH1)
    return _norm(base)


def build_name_map(rows) -> list[tuple[str, str]]:
    """Trả về list (normalized_name, personnel_id) sắp xếp theo độ dài tên giảm dần."""
    result = []
    for r in rows:
        full = _norm(r.full_name or "")
        if full:
            result.append((full, str(r.id)))
    # Tên dài hơn ưu tiên match trước (tránh match nhầm tên ngắn)
    result.sort(key=lambda x: len(x[0]), reverse=True)
    return result


def guess_personnel_id_by_name(fname: str, name_map: list[tuple[str, str]]) -> str | None:
    """Khớp tên nhân viên trong tên file."""
    fname_norm = _name_from_filename(fname)
    if not fname_norm:
        return None
    for name, pid in name_map:
        # Kiểm tra tất cả các từ trong tên đều xuất hiện trong tên file
        words = name.split()
        if len(words) >= 2 and all(w in fname_norm for w in words):
            return pid
    return None


async def run(root_dir: str, dry_run: bool):
    if not os.path.isdir(root_dir):
        print(f"[LỖI] Thư mục không tồn tại: {root_dir}")
        sys.exit(1)

    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        # Load tất cả nhân viên: id + full_name
        rows = (await db.execute(text("SELECT id, full_name, employee_code FROM personnel"))).fetchall()
        name_map = build_name_map(rows)
        print(f"[INFO] Đã load {len(name_map)} nhân viên từ DB")

        # Load file đã link để tránh duplicate
        existing = set(
            r[0] for r in
            (await db.execute(
                text("SELECT original_path FROM personnel_documents WHERE original_path IS NOT NULL")
            )).fetchall()
        )
        print(f"[INFO] {len(existing)} file đã được link trước đó")

        found = skipped = linked = unmatched = thumbs = 0

        for dirpath, _, filenames in os.walk(root_dir):
            # Bỏ qua thư mục thumb (ảnh thumbnail preview)
            rel_dir = os.path.relpath(dirpath, root_dir).replace("\\", "/")
            if "thumb" in rel_dir.split("/"):
                continue

            for fname in filenames:
                ext = os.path.splitext(fname)[1].lower()
                if ext not in ALLOWED_EXT:
                    continue

                full_path = os.path.join(dirpath, fname)
                rel_path  = os.path.relpath(full_path, root_dir).replace("\\", "/")
                found += 1

                if full_path in existing or rel_path in existing:
                    skipped += 1
                    continue

                doc_type     = guess_doc_type(rel_path)
                personnel_id = guess_personnel_id_by_name(fname, name_map)

                if not personnel_id:
                    print(f"  [SKIP] Không tìm được NV: {fname}")
                    unmatched += 1
                    continue

                size     = os.path.getsize(full_path)
                file_url = f"/uploads/personnel/linked/{rel_path}"

                if dry_run:
                    # Tìm tên NV để hiển thị
                    nv_name = next((r.full_name for r in rows if str(r.id) == personnel_id), "?")
                    print(f"  [DRY] {doc_type:12s} | {nv_name:30s} | {fname}")
                    linked += 1
                    continue

                await db.execute(text("""
                    INSERT INTO personnel_documents
                        (id, personnel_id, doc_type, file_name, file_url,
                         file_size_bytes, source, original_path, uploaded_at)
                    VALUES
                        (gen_random_uuid(), :pid, :dtype, :fname, :furl,
                         :fsize, 'LINKED', :opath, NOW())
                    ON CONFLICT DO NOTHING
                """), {
                    "pid":   personnel_id,
                    "dtype": doc_type,
                    "fname": fname,
                    "furl":  file_url,
                    "fsize": size,
                    "opath": rel_path,
                })
                linked += 1

        if not dry_run:
            await db.commit()

    await engine.dispose()

    print(f"\n{'[DRY RUN] ' if dry_run else ''}Kết quả:")
    print(f"  Tổng file tìm thấy  : {found}")
    print(f"  Đã có sẵn (bỏ qua)  : {skipped}")
    print(f"  Không khớp NV       : {unmatched}")
    print(f"  {'Sẽ link' if dry_run else 'Đã link'} thành công: {linked}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Link file cũ vào personnel_documents")
    parser.add_argument("--root",    required=True, help="Thư mục gốc chứa file cũ")
    parser.add_argument("--dry-run", action="store_true", help="Xem trước, không lưu")
    args = parser.parse_args()
    asyncio.run(run(args.root, args.dry_run))
