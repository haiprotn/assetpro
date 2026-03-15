import uuid, re, unicodedata
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.core.auth import get_current_user
from app.models.assets import AssetTypeGroup, AttributeDefinition

router = APIRouter()


def _to_code(name: str) -> str:
    nfkd = unicodedata.normalize('NFKD', str(name))
    return re.sub(r'[^A-Z0-9]+', '_', nfkd.encode('ascii', 'ignore').decode().upper()).strip('_')[:50]


class GroupCreate(BaseModel):
    name: str
    code: Optional[str] = None
    allocation_type: Optional[str] = "RECOVERABLE"
    asset_attribute: Optional[str] = None
    tracking_unit: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    allocation_type: Optional[str] = None
    asset_attribute: Optional[str] = None
    tracking_unit: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None


# ── Nhóm loại tài sản (asset_type_groups) ─────────────────────────────────

@router.get("")
async def list_groups(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    rows = (await db.execute(text("""
        SELECT g.id, g.code, g.name, g.allocation_type, g.asset_attribute,
               g.tracking_unit, g.icon, g.color, g.is_active,
               COUNT(DISTINCT at2.id) AS type_count,
               COUNT(DISTINCT a.id)   AS asset_count
        FROM asset_type_groups g
        LEFT JOIN asset_types at2 ON at2.group_id = g.id
        LEFT JOIN assets a ON a.asset_type_id = at2.id AND a.is_active = TRUE
        WHERE g.is_active = TRUE
        GROUP BY g.id ORDER BY g.name
    """))).mappings().all()
    groups = [dict(r) for r in rows]

    # Attach attribute definitions
    if groups:
        gids = [str(g["id"]) for g in groups]
        attr_rows = (await db.execute(text("""
            SELECT id, group_id, field_key, field_label, field_type,
                   field_unit, is_required, is_searchable, display_order, select_options
            FROM attribute_definitions
            WHERE group_id = ANY(:gids)
            ORDER BY display_order, field_label
        """), {"gids": gids})).mappings().all()
        attrs_by_group: dict = {}
        for a in attr_rows:
            gid = str(a["group_id"])
            attrs_by_group.setdefault(gid, []).append(dict(a))
        for g in groups:
            g["attributes"] = attrs_by_group.get(str(g["id"]), [])

    return groups


@router.post("", status_code=201)
async def create_group(
    data: GroupCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    code = data.code.strip().upper() if data.code else _to_code(data.name)
    exists = (await db.execute(select(AssetTypeGroup).where(AssetTypeGroup.code == code))).scalar_one_or_none()
    if exists:
        raise HTTPException(400, f"Mã nhóm '{code}' đã tồn tại")
    grp = AssetTypeGroup(
        id=uuid.uuid4(), code=code, name=data.name.strip(),
        allocation_type=data.allocation_type or 'RECOVERABLE',
        asset_attribute=data.asset_attribute, tracking_unit=data.tracking_unit,
        icon=data.icon, color=data.color,
    )
    db.add(grp)
    await db.commit()
    await db.refresh(grp)
    return {"id": str(grp.id), "code": grp.code, "name": grp.name,
            "allocation_type": grp.allocation_type, "type_count": 0, "asset_count": 0}


@router.put("/{group_id}")
async def update_group(
    group_id: uuid.UUID,
    data: GroupUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    grp = (await db.execute(select(AssetTypeGroup).where(AssetTypeGroup.id == group_id))).scalar_one_or_none()
    if not grp:
        raise HTTPException(404, "Không tìm thấy nhóm loại tài sản")
    for field, val in data.model_dump(exclude_unset=True).items():
        setattr(grp, field, val)
    await db.commit()
    await db.refresh(grp)
    return {"id": str(grp.id), "code": grp.code, "name": grp.name}


@router.delete("/{group_id}")
async def delete_group(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    grp = (await db.execute(select(AssetTypeGroup).where(AssetTypeGroup.id == group_id))).scalar_one_or_none()
    if not grp:
        raise HTTPException(404, "Không tìm thấy nhóm")
    count = (await db.execute(
        text("SELECT COUNT(*) FROM assets a JOIN asset_types at2 ON at2.id=a.asset_type_id WHERE at2.group_id=:id AND a.is_active=TRUE"),
        {"id": str(group_id)}
    )).scalar()
    if count > 0:
        raise HTTPException(400, f"Nhóm đang có {count} tài sản, không thể xóa")
    grp.is_active = False
    await db.commit()
    return {"ok": True}


# ── Flat list of all specific types (for form dropdowns) ──────────────────

@router.get("/flat-types")
async def list_all_types(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    rows = (await db.execute(text("""
        SELECT at2.id, at2.code, at2.name, g.id AS group_id, g.name AS group_name, g.code AS group_code
        FROM asset_types at2
        JOIN asset_type_groups g ON g.id = at2.group_id
        WHERE g.is_active = TRUE
        ORDER BY g.name, at2.name
    """))).mappings().all()
    return [dict(r) for r in rows]


# ── Loại tài sản cụ thể (asset_types) ─────────────────────────────────────

@router.get("/{group_id}/types")
async def list_types_in_group(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rows = (await db.execute(text("""
        SELECT at2.id, at2.code, at2.name, COUNT(a.id) AS asset_count
        FROM asset_types at2
        LEFT JOIN assets a ON a.asset_type_id = at2.id AND a.is_active = TRUE
        WHERE at2.group_id = :gid
        GROUP BY at2.id ORDER BY at2.name
    """), {"gid": str(group_id)})).mappings().all()
    return [dict(r) for r in rows]


class TypeCreate(BaseModel):
    name: str
    code: Optional[str] = None


@router.post("/{group_id}/types", status_code=201)
async def create_type(
    group_id: uuid.UUID,
    data: TypeCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    code = data.code.strip().upper() if data.code else _to_code(data.name)
    exists = (await db.execute(text("SELECT id FROM asset_types WHERE code=:code"), {"code": code})).fetchone()
    if exists:
        raise HTTPException(400, f"Mã loại '{code}' đã tồn tại")
    new_id = str(uuid.uuid4())
    await db.execute(text(
        "INSERT INTO asset_types (id, group_id, code, name) VALUES (:id, :gid, :code, :name)"
    ), {"id": new_id, "gid": str(group_id), "code": code, "name": data.name.strip()})
    await db.commit()
    return {"id": new_id, "code": code, "name": data.name.strip(), "asset_count": 0}


@router.delete("/{group_id}/types/{type_id}")
async def delete_type(
    group_id: uuid.UUID,
    type_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    count = (await db.execute(
        text("SELECT COUNT(*) FROM assets WHERE asset_type_id=:id AND is_active=TRUE"),
        {"id": str(type_id)}
    )).scalar()
    if count > 0:
        raise HTTPException(400, f"Loại TS đang có {count} tài sản, không thể xóa")
    await db.execute(text("DELETE FROM asset_types WHERE id=:id"), {"id": str(type_id)})
    await db.commit()
    return {"ok": True}


# ── Thuộc tính động (attribute_definitions) ────────────────────────────────

class AttributeCreate(BaseModel):
    field_key: Optional[str] = None
    field_label: str
    field_type: str = "TEXT"
    field_unit: Optional[str] = None
    is_required: bool = False
    is_searchable: bool = False
    show_in_table: bool = False
    display_order: int = 0
    select_options: Optional[list] = None


class AttributeUpdate(BaseModel):
    field_label: Optional[str] = None
    field_type: Optional[str] = None
    field_unit: Optional[str] = None
    is_required: Optional[bool] = None
    is_searchable: Optional[bool] = None
    show_in_table: Optional[bool] = None
    display_order: Optional[int] = None
    select_options: Optional[list] = None


@router.post("/{group_id}/attributes", status_code=201)
async def create_attribute(
    group_id: uuid.UUID,
    data: AttributeCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    grp = (await db.execute(select(AssetTypeGroup).where(AssetTypeGroup.id == group_id))).scalar_one_or_none()
    if not grp:
        raise HTTPException(404, "Không tìm thấy nhóm loại tài sản")
    field_key = data.field_key or _to_code(data.field_label).lower()
    attr = AttributeDefinition(
        id=uuid.uuid4(),
        group_id=group_id,
        field_key=field_key,
        field_label=data.field_label,
        field_type=data.field_type,
        field_unit=data.field_unit,
        is_required=data.is_required,
        is_searchable=data.is_searchable,
        show_in_table=data.show_in_table,
        display_order=data.display_order,
        select_options=data.select_options,
    )
    db.add(attr)
    await db.commit()
    await db.refresh(attr)
    return {
        "id": str(attr.id), "group_id": str(attr.group_id),
        "field_key": attr.field_key, "field_label": attr.field_label,
        "field_type": attr.field_type, "field_unit": attr.field_unit,
        "is_required": attr.is_required, "display_order": attr.display_order,
    }


@router.put("/{group_id}/attributes/{attr_id}")
async def update_attribute(
    group_id: uuid.UUID,
    attr_id: uuid.UUID,
    data: AttributeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    attr = (await db.execute(
        select(AttributeDefinition).where(
            AttributeDefinition.id == attr_id,
            AttributeDefinition.group_id == group_id,
        )
    )).scalar_one_or_none()
    if not attr:
        raise HTTPException(404, "Không tìm thấy thuộc tính")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(attr, k, v)
    await db.commit()
    await db.refresh(attr)
    return {"id": str(attr.id), "field_key": attr.field_key, "field_label": attr.field_label}


@router.delete("/{group_id}/attributes/{attr_id}")
async def delete_attribute(
    group_id: uuid.UUID,
    attr_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    attr = (await db.execute(
        select(AttributeDefinition).where(
            AttributeDefinition.id == attr_id,
            AttributeDefinition.group_id == group_id,
        )
    )).scalar_one_or_none()
    if not attr:
        raise HTTPException(404, "Không tìm thấy thuộc tính")
    await db.delete(attr)
    await db.commit()
    return {"ok": True}
