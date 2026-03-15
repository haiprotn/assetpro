import uuid, re, unicodedata
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.core.auth import get_current_user
from app.models.assets import Department

router = APIRouter()


def _to_code(name: str) -> str:
    nfkd = unicodedata.normalize('NFKD', str(name))
    return re.sub(r'[^A-Z0-9]+', '_', nfkd.encode('ascii', 'ignore').decode().upper()).strip('_')[:50]


class DeptCreate(BaseModel):
    name: str
    code: Optional[str] = None
    department_type: Optional[str] = "ADMIN"


class DeptUpdate(BaseModel):
    name: Optional[str] = None
    department_type: Optional[str] = None


@router.get("")
async def list_departments(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    rows = (await db.execute(text("""
        SELECT d.id, d.code, d.name, d.department_type, d.is_active,
               COUNT(a.id) AS asset_count
        FROM departments d
        LEFT JOIN assets a ON a.managing_department_id = d.id AND a.is_active = TRUE
        WHERE d.is_active = TRUE
        GROUP BY d.id ORDER BY d.name
    """))).mappings().all()
    return [dict(r) for r in rows]


@router.post("", status_code=201)
async def create_department(
    data: DeptCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    code = data.code.strip().upper() if data.code else _to_code(data.name)
    exists = (await db.execute(select(Department).where(Department.code == code))).scalar_one_or_none()
    if exists:
        raise HTTPException(400, f"Mã phòng ban '{code}' đã tồn tại")
    dept = Department(id=uuid.uuid4(), code=code, name=data.name.strip(),
                      department_type=data.department_type or 'ADMIN')
    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    return {"id": str(dept.id), "code": dept.code, "name": dept.name,
            "department_type": dept.department_type, "asset_count": 0}


@router.put("/{dept_id}")
async def update_department(
    dept_id: uuid.UUID,
    data: DeptUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    dept = (await db.execute(select(Department).where(Department.id == dept_id))).scalar_one_or_none()
    if not dept:
        raise HTTPException(404, "Không tìm thấy phòng ban")
    if data.name:
        dept.name = data.name.strip()
    if data.department_type:
        dept.department_type = data.department_type
    await db.commit()
    await db.refresh(dept)
    return {"id": str(dept.id), "code": dept.code, "name": dept.name,
            "department_type": dept.department_type}


@router.delete("/{dept_id}")
async def delete_department(
    dept_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    dept = (await db.execute(select(Department).where(Department.id == dept_id))).scalar_one_or_none()
    if not dept:
        raise HTTPException(404, "Không tìm thấy phòng ban")
    count = (await db.execute(
        text("SELECT COUNT(*) FROM assets WHERE managing_department_id=:id AND is_active=TRUE"),
        {"id": str(dept_id)}
    )).scalar()
    if count > 0:
        raise HTTPException(400, f"Phòng ban đang quản lý {count} tài sản, không thể xóa")
    dept.is_active = False
    await db.commit()
    return {"ok": True}
