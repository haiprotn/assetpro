import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text
from app.db.session import get_db
from app.core.auth import get_current_user
from app.schemas.assets import MaintenanceCreate, MaintenanceComplete
from app.models.assets import MaintenanceRecord

router = APIRouter()

_LIST_SQL = """
    SELECT m.*,
           a.asset_code,
           a.name AS asset_name
    FROM maintenance_records m
    LEFT JOIN assets a ON a.id = m.asset_id
    {where}
    ORDER BY m.created_at DESC
    LIMIT :limit OFFSET :offset
"""

@router.get("")
async def list_maintenance(
    status: Optional[str] = Query(None),
    asset_id: Optional[uuid.UUID] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    where_parts = ["1=1"]
    params = {"limit": size, "offset": (page - 1) * size}
    if status:
        where_parts.append("m.status = :status")
        params["status"] = status
    if asset_id:
        where_parts.append("m.asset_id = :asset_id")
        params["asset_id"] = str(asset_id)
    sql = _LIST_SQL.format(where="WHERE " + " AND ".join(where_parts))
    rows = (await db.execute(text(sql), params)).mappings().all()
    return [dict(r) for r in rows]


@router.post("", status_code=201)
async def create_maintenance(
    data: MaintenanceCreate,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    record = MaintenanceRecord(id=uuid.uuid4(), created_by=current_user.id, **data.model_dump())
    db.add(record)
    await db.commit()
    # Return enriched row
    row = (await db.execute(
        text("SELECT m.*, a.asset_code, a.name AS asset_name FROM maintenance_records m LEFT JOIN assets a ON a.id = m.asset_id WHERE m.id = :id"),
        {"id": str(record.id)}
    )).mappings().first()
    return dict(row) if row else record


@router.post("/{record_id}/complete")
async def complete_maintenance(
    record_id: uuid.UUID,
    data: MaintenanceComplete,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(MaintenanceRecord).where(MaintenanceRecord.id == record_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiếu bảo trì")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(record, k, v)
    record.status = "COMPLETED"
    await db.commit()
    row = (await db.execute(
        text("SELECT m.*, a.asset_code, a.name AS asset_name FROM maintenance_records m LEFT JOIN assets a ON a.id = m.asset_id WHERE m.id = :id"),
        {"id": str(record.id)}
    )).mappings().first()
    return dict(row) if row else record


@router.post("/{record_id}/cancel")
async def cancel_maintenance(
    record_id: uuid.UUID,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(MaintenanceRecord).where(MaintenanceRecord.id == record_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiếu bảo trì")
    if record.status == "COMPLETED":
        raise HTTPException(status_code=409, detail="Phiếu đã hoàn thành, không thể huỷ")
    record.status = "CANCELLED"
    await db.commit()
    return {"ok": True}
