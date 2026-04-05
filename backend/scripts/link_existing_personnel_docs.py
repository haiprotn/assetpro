"""
Script liên kết file cũ vào bảng personnel_documents
======================================================
Cách dùng trên server:
    docker exec -it asset_backend python /app/scripts/link_existing_personnel_docs.py \
        --root /path/to/old/uploads \
        --dry-run        # Xem trước, chưa lưu

    docker exec -it asset_backend python /app/scripts/link_existing_personnel_docs.py \
        --root /path/to/old/uploads
        # Chạy thật

Cấu trúc thư mục cũ được nhận diện:
    modules/personnel.profile/profile/           → doc_type PROFILE
    modules/personnel.profile/*-profile/         → doc_type PHOTO
    modules/personnel.profile/*-certificate/     → doc_type CERTIFICATE
    modules/contract/contract/                   → doc_type CONTRACT
"""

import argparse
import asyncio
import os
import sys
import re

# Thêm app vào path
sys.path.insert(0, "/app")

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://asset_user:AssetPro2026@postgres:5432/asset_management"
)

# Map pattern thư mục → doc_type
DIR_TYPE_MAP = [
    (re.compile(r"personnel[._-]profile[/\\].*profile", re.I),     "PHOTO"),
    (re.compile(r"personnel[._-]profile[/\\].*certificate", re.I), "CERTIFICATE"),
    (re.compile(r"personnel[._-]profile[/\\]profile", re.I),       "PROFILE"),
    (re.compile(r"personnel[._-]profile",              re.I),       "PROFILE"),
    (re.compile(r"contract",                           re.I),       "CONTRACT"),
    (re.compile(r"document",                           re.I),       "OTHER"),
]

ALLOWED_EXT = {".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".doc", ".docx", ".xls", ".xlsx"}


def guess_doc_type(filepath: str) -> str:
    norm = filepath.replace("\\", "/")
    for pattern, dtype in DIR_TYPE_MAP:
        if pattern.search(norm):
            return dtype
    return "OTHER"


def guess_personnel_id_from_path(filepath: str, emp_code_map: dict) -> str | None:
    """Thử tìm mã nhân viên trong tên file hoặc thư mục cha"""
    parts = filepath.replace("\\", "/").split("/")
    for part in reversed(parts):
        # Tìm mã NV trong tên file hoặc folder (VD: NV001, 001, ...)
        for code, pid in emp_code_map.items():
            if code.lower() in part.lower():
                return pid
    return None


async def run(root_dir: str, dry_run: bool):
    if not os.path.isdir(root_dir):
        print(f"[LỖI] Thư mục không tồn tại: {root_dir}")
        sys.exit(1)

    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        # Load all personnel employee_code → id
        rows = (await db.execute(text("SELECT id, employee_code FROM personnel"))).fetchall()
        emp_code_map = {r.employee_code: str(r.id) for r in rows}
        print(f"[INFO] Đã load {len(emp_code_map)} nhân viên từ DB")

        # Load existing file_urls để tránh duplicate
        existing = set(
            r[0] for r in
            (await db.execute(text("SELECT original_path FROM personnel_documents WHERE original_path IS NOT NULL"))).fetchall()
        )
        print(f"[INFO] {len(existing)} file đã được link trước đó")

        found = skipped = linked = unmatched = 0

        for dirpath, _, filenames in os.walk(root_dir):
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
                personnel_id = guess_personnel_id_from_path(rel_path, emp_code_map)

                if not personnel_id:
                    print(f"  [SKIP] Không tìm được NV: {rel_path}")
                    unmatched += 1
                    continue

                size = os.path.getsize(full_path)
                # URL phục vụ qua nginx/volume mount
                file_url = f"/uploads/personnel/linked/{rel_path}"

                if dry_run:
                    print(f"  [DRY] {doc_type:12s} | {personnel_id[:8]}... | {rel_path}")
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
    print(f"  Tổng file tìm thấy : {found}")
    print(f"  Đã có sẵn (bỏ qua) : {skipped}")
    print(f"  Không khớp NV      : {unmatched}")
    print(f"  {'Sẽ link' if dry_run else 'Đã link'} thành công: {linked}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Link file cũ vào personnel_documents")
    parser.add_argument("--root",    required=True, help="Thư mục gốc chứa file cũ")
    parser.add_argument("--dry-run", action="store_true", help="Xem trước, không lưu")
    args = parser.parse_args()
    asyncio.run(run(args.root, args.dry_run))
