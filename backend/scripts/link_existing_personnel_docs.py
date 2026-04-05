"""
Script liên kết file cũ vào bảng personnel_documents
======================================================
Đọc MySQL dump từ phần mềm cũ để xác định chính xác file → nhân viên.

Cách dùng trên server:
    # 1. Copy file SQL + thư mục files lên server trước
    # 2. Chạy dry-run
    docker exec -it asset_backend python /app/scripts/link_existing_personnel_docs.py \
        --files-dir  /app/uploads/personnel/linked/modules \
        --sql-file   /app/uploads/personnel/linked/officecloud_dth.personnels.sql.gz \
        --dry-run

    # 3. Chạy thật
    docker exec -it asset_backend python /app/scripts/link_existing_personnel_docs.py \
        --files-dir  /app/uploads/personnel/linked/modules \
        --sql-file   /app/uploads/personnel/linked/officecloud_dth.personnels.sql.gz
"""

import argparse
import asyncio
import gzip
import os
import re
import sys
import unicodedata

sys.path.insert(0, "/app")

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://asset_user:AssetPro2026@postgres:5432/asset_management"
)

ALLOWED_EXT = {".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp",
               ".doc", ".docx", ".xls", ".xlsx", ".JPG", ".PDF"}

# Vị trí cột trong bảng personnels (0-indexed)
# Xác định bằng cách đếm từ schema
COL_ID    = 0
COL_CODE  = 1
COL_NAME  = 6    # `name`
COL_PHOTO = 23   # `photo`
COL_FRONT = 23   # sẽ tìm dynamic bằng tên cột
COL_BACK  = 24

# Tên cột cần lấy (parse từ schema)
NEEDED_COLS = {
    "photo":              "PHOTO",
    "personnel_photo":    "PHOTO",
    "private_code_front": "ID_CARD",
    "private_code_back":  "ID_CARD",
    "certificate_path":   "CERTIFICATE",
}

# Map thư mục → doc_type (fallback khi không có SQL)
DIR_TYPE_MAP = [
    (re.compile(r"personnel-profile-certificate|appmodel.*certificate", re.I), "CERTIFICATE"),
    (re.compile(r"personnel-profile-profile",                            re.I), "PROFILE"),
    (re.compile(r"personnel[._-]profile",                               re.I), "PROFILE"),
    (re.compile(r"contract",                                             re.I), "CONTRACT"),
]


def _norm(s: str) -> str:
    nfkd = unicodedata.normalize("NFKD", s)
    ascii_ = "".join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r"[\s\-_]+", " ", ascii_.lower()).strip()


def guess_doc_type(rel_path: str) -> str:
    norm = rel_path.replace("\\", "/")
    for pattern, dtype in DIR_TYPE_MAP:
        if pattern.search(norm):
            return dtype
    return "OTHER"


# ──────────────────────────────────────────────────────────────
# Parse MySQL dump để lấy schema + data
# ──────────────────────────────────────────────────────────────
def _open_sql(sql_file: str):
    if sql_file.endswith(".gz"):
        return gzip.open(sql_file, "rt", encoding="utf-8", errors="replace")
    return open(sql_file, "r", encoding="utf-8", errors="replace")


def get_col_indices(sql_file: str) -> dict[str, int]:
    """Đọc schema để lấy vị trí cột theo tên."""
    col_order = []
    in_create = False
    with _open_sql(sql_file) as f:
        for line in f:
            line = line.strip()
            if line.upper().startswith("CREATE TABLE"):
                in_create = True
                col_order = []
                continue
            if in_create:
                if line.startswith(")"):
                    break
                # Dòng định nghĩa cột: `col_name` type ...
                m = re.match(r"`(\w+)`\s+", line)
                if m:
                    col_order.append(m.group(1))
    return {name: idx for idx, name in enumerate(col_order)}


def _split_mysql_row(row_str: str) -> list[str]:
    """Tách các giá trị trong 1 row MySQL VALUES."""
    values = []
    i = 0
    s = row_str.strip()
    # Bỏ dấu ( ) ngoài cùng
    if s.startswith("("):
        s = s[1:]
    if s.endswith("),") or s.endswith(")"):
        s = s.rstrip(",)")

    while i < len(s):
        if s[i] == '"':
            # Chuỗi có thể chứa escape \" hoặc ""
            j = i + 1
            buf = []
            while j < len(s):
                if s[j] == '\\' and j + 1 < len(s):
                    buf.append(s[j + 1])
                    j += 2
                elif s[j] == '"':
                    j += 1
                    break
                else:
                    buf.append(s[j])
                    j += 1
            values.append("".join(buf))
            i = j
            # Bỏ dấu phẩy tiếp theo
            if i < len(s) and s[i] == ',':
                i += 1
        elif s[i:i+4].upper() == 'NULL':
            values.append(None)
            i += 4
            if i < len(s) and s[i] == ',':
                i += 1
        else:
            # Số hoặc giá trị không có dấu nháy
            j = i
            while j < len(s) and s[j] != ',':
                j += 1
            values.append(s[i:j].strip())
            i = j
            if i < len(s) and s[i] == ',':
                i += 1
    return values


def parse_personnel_sql(sql_file: str) -> dict[str, dict]:
    """
    Parse file SQL và trả về:
    {
      old_id_str: {
        "name": "NGUYỄN VĂN A",
        "files": {"filename.jpg": "PHOTO", "front.jpg": "ID_CARD", ...}
      }
    }
    """
    print(f"[INFO] Đọc schema từ {os.path.basename(sql_file)}...")
    col_idx = get_col_indices(sql_file)
    if not col_idx:
        print("[CẢNH BÁO] Không đọc được schema, dùng vị trí cột mặc định")
        col_idx = {"ID": 0, "code": 1, "name": 6,
                   "photo": 23, "private_code_front": -1, "private_code_back": -1}

    print(f"[INFO] Schema: {len(col_idx)} cột. Cột cần thiết:")
    for cname in ["ID", "name", "photo", "private_code_front", "private_code_back", "certificate_path"]:
        print(f"       {cname} → vị trí {col_idx.get(cname, 'N/A')}")

    result: dict[str, dict] = {}

    print(f"[INFO] Đọc data từ {os.path.basename(sql_file)}...")
    in_insert = False
    with _open_sql(sql_file) as f:
        for line in f:
            line = line.rstrip("\n")
            if re.match(r"INSERT INTO `personnels`", line, re.I):
                in_insert = True
                continue
            if not in_insert:
                continue
            if not line.strip() or line.strip().startswith("/*") or line.strip().startswith("--"):
                continue
            # Mỗi row bắt đầu bằng "("
            if not line.strip().startswith("("):
                in_insert = False
                continue

            row_str = line.strip()
            vals = _split_mysql_row(row_str)
            if len(vals) < max(col_idx.get("name", 6), col_idx.get("photo", 23)) + 1:
                continue

            old_id = str(vals[col_idx.get("ID", 0)] or "").strip()
            name   = (vals[col_idx.get("name", 6)] or "").strip()
            if not old_id or not name:
                continue

            files: dict[str, str] = {}
            for col_name, doc_type in NEEDED_COLS.items():
                idx = col_idx.get(col_name)
                if idx is None or idx >= len(vals):
                    continue
                val = vals[idx]
                if val and str(val).strip() and str(val).strip().lower() not in ("null", "0", ""):
                    fname = os.path.basename(str(val).strip())
                    if fname:
                        files[fname.lower()] = doc_type

            result[old_id] = {"name": name, "files": files}

    print(f"[INFO] Đọc được {len(result)} nhân viên từ SQL dump")
    return result


# ──────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────
async def run(files_dir: str, sql_file: str | None, dry_run: bool):
    if not os.path.isdir(files_dir):
        print(f"[LỖI] Thư mục files không tồn tại: {files_dir}")
        sys.exit(1)

    # Đọc mapping từ SQL dump
    old_personnel: dict[str, dict] = {}   # {old_id: {name, files}}
    file_to_old: dict[str, tuple[str, str]] = {}  # {fname_lower: (old_id, doc_type)}

    if sql_file and os.path.isfile(sql_file):
        old_personnel = parse_personnel_sql(sql_file)
        for old_id, info in old_personnel.items():
            for fname, dtype in info["files"].items():
                file_to_old[fname] = (old_id, dtype)
        print(f"[INFO] File mapping từ SQL: {len(file_to_old)} files")
    else:
        print("[CẢNH BÁO] Không có SQL dump, sẽ match theo tên file")

    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        rows = (await db.execute(
            text("SELECT id, full_name, employee_code FROM personnel")
        )).fetchall()
        print(f"[INFO] Đã load {len(rows)} nhân viên từ DB mới")

        # Map: normalized_name → new_uuid
        name_map = {_norm(r.full_name or ""): str(r.id) for r in rows if r.full_name}

        # Map: old_id → new_uuid (qua tên)
        old_to_new: dict[str, str] = {}
        unmatched_old = []
        for old_id, info in old_personnel.items():
            norm = _norm(info["name"])
            if norm in name_map:
                old_to_new[old_id] = name_map[norm]
            else:
                unmatched_old.append(f"  old_id={old_id}: {info['name']}")

        if unmatched_old:
            print(f"[CẢNH BÁO] {len(unmatched_old)} NV cũ không khớp tên trong DB mới:")
            for s in unmatched_old[:10]:
                print(s)
            if len(unmatched_old) > 10:
                print(f"  ... và {len(unmatched_old)-10} NV khác")

        print(f"[INFO] Khớp {len(old_to_new)}/{len(old_personnel)} NV cũ → NV mới")

        # File đã link
        existing = set(
            r[0] for r in (await db.execute(
                text("SELECT original_path FROM personnel_documents WHERE original_path IS NOT NULL")
            )).fetchall()
        )
        print(f"[INFO] {len(existing)} file đã link trước đó\n")

        found = skipped = linked = unmatched = 0

        for dirpath, dirnames, filenames in os.walk(files_dir):
            dirnames[:] = [d for d in dirnames if d != "thumb"]

            for fname in filenames:
                ext = os.path.splitext(fname)[1]
                if ext.lower() not in {e.lower() for e in ALLOWED_EXT}:
                    continue

                full_path = os.path.join(dirpath, fname)
                rel_path  = os.path.relpath(full_path, files_dir).replace("\\", "/")
                found += 1

                if rel_path in existing:
                    skipped += 1
                    continue

                doc_type     = guess_doc_type(rel_path)
                personnel_id = None
                match_method = ""

                # Ưu tiên 1: SQL dump mapping
                sql_info = file_to_old.get(fname.lower())
                if sql_info:
                    old_id, sql_dtype = sql_info
                    doc_type = sql_dtype
                    personnel_id = old_to_new.get(old_id)
                    match_method = f"sql(old_id={old_id})"

                # Ưu tiên 2: match tên trong filename
                if not personnel_id:
                    norm_fname = _norm(re.sub(
                        r"\d{2}[.]\d{2}[.]\d{2}[-]\d{2}[.]\d{2}[.]\d{4}", "",
                        os.path.splitext(fname)[0]
                    ))
                    for norm_name, nid in sorted(name_map.items(), key=lambda x: -len(x[0])):
                        words = norm_name.split()
                        if len(words) >= 2 and all(w in norm_fname for w in words):
                            personnel_id = nid
                            match_method = f"name({norm_name})"
                            break

                if not personnel_id:
                    if not match_method:
                        print(f"  [SKIP] {rel_path}")
                    unmatched += 1
                    continue

                size     = os.path.getsize(full_path)
                file_url = f"/uploads/personnel/linked/{rel_path}"

                if dry_run:
                    nv_name = next((r.full_name for r in rows if str(r.id) == personnel_id), "?")
                    print(f"  [DRY] {doc_type:12s} | {nv_name:30s} | {fname}  [{match_method}]")
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
    parser = argparse.ArgumentParser()
    parser.add_argument("--files-dir", required=True,
                        help="Thư mục modules/ của phần mềm cũ")
    parser.add_argument("--sql-file",  default=None,
                        help="File SQL dump personnels (officecloud_dth.personnels.sql.gz)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    asyncio.run(run(args.files_dir, args.sql_file, args.dry_run))
