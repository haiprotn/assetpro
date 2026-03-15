import uuid
from fastapi import APIRouter, Depends
from sqlalchemy import text
from app.db.session import get_db
from app.core.auth import get_current_user

router = APIRouter()


@router.get("")
async def list_suppliers(db=Depends(get_db), current_user=Depends(get_current_user)):
    rows = (await db.execute(text(
        "SELECT id, code, name, address, phone, email FROM suppliers WHERE is_active=TRUE ORDER BY name"
    ))).mappings().all()
    return [dict(r) for r in rows]


@router.post("", status_code=201)
async def create_supplier(data: dict, db=Depends(get_db), current_user=Depends(get_current_user)):
    import re, unicodedata
    def _to_code(name):
        nfkd = unicodedata.normalize('NFKD', str(name))
        return re.sub(r'[^A-Z0-9]+', '_', nfkd.encode('ascii', 'ignore').decode().upper()).strip('_')[:50]
    raw_code = data.get("code", "").strip().upper()
    if not raw_code:
        raw_code = _to_code(data.get("name", "NCC"))
    # Ensure uniqueness
    base = raw_code
    code = base
    for i in range(1, 100):
        exists = (await db.execute(text("SELECT 1 FROM suppliers WHERE code=:c"), {"c": code})).fetchone()
        if not exists:
            break
        code = f"{base}_{i}"
    sid = uuid.uuid4()
    await db.execute(text("""
        INSERT INTO suppliers (id, code, name, address, phone, email)
        VALUES (:id, :code, :name, :address, :phone, :email)
    """), {
        "id": str(sid),
        "code": code,
        "name": data.get("name", ""),
        "address": data.get("address"),
        "phone": data.get("phone"),
        "email": data.get("email"),
    })
    await db.commit()
    row = (await db.execute(text("SELECT * FROM suppliers WHERE id=:id"), {"id": str(sid)})).mappings().one()
    return dict(row)


@router.put("/{supplier_id}")
async def update_supplier(supplier_id: uuid.UUID, data: dict, db=Depends(get_db), current_user=Depends(get_current_user)):
    await db.execute(text("""
        UPDATE suppliers SET name=:name, address=:address, phone=:phone, email=:email
        WHERE id=:id
    """), {
        "id": str(supplier_id),
        "name": data.get("name", ""),
        "address": data.get("address"),
        "phone": data.get("phone"),
        "email": data.get("email"),
    })
    await db.commit()
    row = (await db.execute(text("SELECT * FROM suppliers WHERE id=:id"), {"id": str(supplier_id)})).mappings().one()
    return dict(row)


@router.delete("/{supplier_id}", status_code=204)
async def delete_supplier(supplier_id: uuid.UUID, db=Depends(get_db), current_user=Depends(get_current_user)):
    await db.execute(text("UPDATE suppliers SET is_active=FALSE WHERE id=:id"), {"id": str(supplier_id)})
    await db.commit()
