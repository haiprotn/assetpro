from fastapi import APIRouter, Depends
from app.db.session import get_db
from app.core.auth import get_current_user

router = APIRouter()

@router.get("")
async def list_locations(db=Depends(get_db), current_user=Depends(get_current_user)):
    from sqlalchemy import select
    from app.models.assets import Location
    result = await db.execute(select(Location).where(Location.is_active == True))
    return result.scalars().all()

@router.post("", status_code=201)
async def create_location(data: dict, db=Depends(get_db), current_user=Depends(get_current_user)):
    import uuid
    from app.models.assets import Location
    loc = Location(id=uuid.uuid4(), **data)
    db.add(loc)
    await db.commit()
    await db.refresh(loc)
    return loc
