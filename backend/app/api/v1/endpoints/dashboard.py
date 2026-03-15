from fastapi import APIRouter, Depends
from sqlalchemy import text
from app.db.session import get_db
from app.core.auth import get_current_user

router = APIRouter()

@router.get("/summary")
async def get_summary(db=Depends(get_db), current_user=Depends(get_current_user)):
    result = await db.execute(text("""
        SELECT
            COUNT(*) as total_assets,
            COALESCE(SUM(original_value), 0) as total_value,
            COUNT(*) FILTER (WHERE status = 'IN_USE') as in_use,
            COUNT(*) FILTER (WHERE status = 'PENDING_ALLOCATION') as pending,
            COUNT(*) FILTER (WHERE status = 'IN_MAINTENANCE') as in_maintenance
        FROM assets WHERE is_active = TRUE
    """))
    row = result.fetchone()
    return dict(row._mapping)

@router.get("/by-location")
async def by_location(db=Depends(get_db), current_user=Depends(get_current_user)):
    from app.services.asset_service import AssetService
    return await AssetService.get_stats_by_location(db)

@router.get("/alerts")
async def alerts(db=Depends(get_db), current_user=Depends(get_current_user)):
    from app.services.asset_service import AssetService
    return await AssetService.get_alerts(db)
