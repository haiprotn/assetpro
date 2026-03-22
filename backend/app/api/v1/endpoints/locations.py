import uuid
import re
import unicodedata
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import select
from app.db.session import get_db
from app.core.auth import get_current_user
from app.models.assets import Location

router = APIRouter()


def _to_code(name: str) -> str:
    nfkd = unicodedata.normalize('NFKD', str(name))
    return re.sub(r'[^A-Z0-9]+', '_', nfkd.encode('ascii', 'ignore').decode().upper()).strip('_')[:50]


class LocationCreate(BaseModel):
    name: str
    code: Optional[str] = None
    address: Optional[str] = None
    province: Optional[str] = None
    location_type: Optional[str] = None


class LocationUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    province: Optional[str] = None
    location_type: Optional[str] = None


@router.get("")
async def list_locations(db=Depends(get_db), current_user=Depends(get_current_user)):
    result = await db.execute(select(Location).where(Location.is_active == True).order_by(Location.name))
    return result.scalars().all()


@router.post("", status_code=201)
async def create_location(data: LocationCreate, db=Depends(get_db), current_user=Depends(get_current_user)):
    code = data.code.strip().upper() if data.code else _to_code(data.name)
    if not code:
        code = str(uuid.uuid4())[:8].upper()
    existing = (await db.execute(select(Location).where(Location.code == code))).scalar_one_or_none()
    if existing:
        raise HTTPException(400, f"Mã vị trí '{code}' đã tồn tại")
    loc = Location(
        id=uuid.uuid4(), code=code, name=data.name.strip(),
        address=data.address, province=data.province, location_type=data.location_type,
    )
    db.add(loc)
    await db.commit()
    await db.refresh(loc)
    return loc


@router.put("/{location_id}")
async def update_location(location_id: uuid.UUID, data: LocationUpdate, db=Depends(get_db), current_user=Depends(get_current_user)):
    loc = (await db.execute(select(Location).where(Location.id == location_id))).scalar_one_or_none()
    if not loc:
        raise HTTPException(404, "Không tìm thấy vị trí")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(loc, k, v)
    await db.commit()
    await db.refresh(loc)
    return loc


@router.delete("/{location_id}", status_code=204)
async def delete_location(location_id: uuid.UUID, db=Depends(get_db), current_user=Depends(get_current_user)):
    loc = (await db.execute(select(Location).where(Location.id == location_id))).scalar_one_or_none()
    if not loc:
        raise HTTPException(404, "Không tìm thấy vị trí")
    loc.is_active = False
    await db.commit()
