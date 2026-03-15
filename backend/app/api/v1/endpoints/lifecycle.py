import uuid
from fastapi import APIRouter, Depends, Query
from typing import Optional
from sqlalchemy import text, func, select
from app.db.session import get_db
from app.core.auth import get_current_user
from app.models.assets import AssetLifecycleEvent

router = APIRouter()

_ENRICH_SQL = """
    SELECT
        e.*,
        a.asset_code,
        a.name                                    AS asset_name,
        fl.name                                   AS from_location_name,
        tl.name                                   AS to_location_name,
        COALESCE(p.full_name, u.username)         AS performed_by_name,
        t.order_code                              AS transfer_order_code
    FROM asset_lifecycle_events e
    LEFT JOIN assets           a  ON a.id  = e.asset_id
    LEFT JOIN locations        fl ON fl.id = e.from_location_id
    LEFT JOIN locations        tl ON tl.id = e.to_location_id
    LEFT JOIN users            u  ON u.id  = e.performed_by
    LEFT JOIN personnel        p  ON p.id  = u.personnel_id
    LEFT JOIN transfer_orders  t  ON t.id  = e.transfer_order_id
    {where}
    ORDER BY e.created_at DESC
    LIMIT :limit OFFSET :offset
"""

_COUNT_SQL = """
    SELECT COUNT(*) FROM asset_lifecycle_events e {where}
"""


@router.get("")
async def list_events(
    event_type: Optional[str]      = Query(None),
    asset_id:   Optional[uuid.UUID]= Query(None),
    date_from:  Optional[str]      = Query(None),
    date_to:    Optional[str]      = Query(None),
    q:          Optional[str]      = Query(None),  # search by asset code/name
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    where_parts = ["1=1"]
    params: dict = {"limit": size, "offset": (page - 1) * size}

    if event_type:
        where_parts.append("e.event_type = :event_type")
        params["event_type"] = event_type
    if asset_id:
        where_parts.append("e.asset_id = :asset_id")
        params["asset_id"] = str(asset_id)
    if date_from:
        where_parts.append("e.created_at >= :date_from")
        params["date_from"] = date_from
    if date_to:
        where_parts.append("e.created_at < :date_to")
        params["date_to"] = date_to
    if q:
        where_parts.append("(a.asset_code ILIKE :q OR a.name ILIKE :q)")
        params["q"] = f"%{q}%"

    where_clause = "WHERE " + " AND ".join(where_parts)
    if q:
        # q filter needs the assets JOIN to exist even for count
        count_sql = _COUNT_SQL.replace("{where}", "LEFT JOIN assets a ON a.id = e.asset_id " + where_clause)
    else:
        count_sql = _COUNT_SQL.format(where=where_clause)

    count_params = {k: v for k, v in params.items() if k not in ("limit", "offset")}
    total = (await db.execute(text(count_sql), count_params)).scalar()

    rows = (await db.execute(text(_ENRICH_SQL.format(where=where_clause)), params)).mappings().all()
    return {
        "total": total,
        "page": page,
        "size": size,
        "items": [dict(r) for r in rows],
    }
