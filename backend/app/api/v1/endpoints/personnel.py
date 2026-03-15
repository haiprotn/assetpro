from fastapi import APIRouter, Depends
from app.db.session import get_db
from app.core.auth import get_current_user

router = APIRouter()

@router.get("")
async def list_personnel(db=Depends(get_db), current_user=Depends(get_current_user)):
    from sqlalchemy import select
    from app.models.assets import Personnel
    result = await db.execute(select(Personnel).where(Personnel.is_active == True))
    return result.scalars().all()
