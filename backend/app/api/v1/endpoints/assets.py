"""
Assets API Endpoints
"""
import os
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.assets import (
    AssetCreate, AssetUpdate, AssetOut, AssetListOut
)
from app.services.asset_service import AssetService
from app.core.auth import get_current_user

_UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/app/uploads/assets")

router = APIRouter()


@router.get("", response_model=AssetListOut)
async def list_assets(
    q: Optional[str] = Query(None, description="Search by name, code, barcode"),
    status: Optional[str] = Query(None),
    asset_type_id: Optional[uuid.UUID] = Query(None),
    group_code: Optional[str] = Query(None),
    location_id: Optional[uuid.UUID] = Query(None),
    department_id: Optional[uuid.UUID] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    sort_by: Optional[str] = Query(None, description="Column to sort: name, asset_code, status, location, department, original_value, purchase_date"),
    sort_dir: Optional[str] = Query("asc", description="asc or desc"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    List and search assets with filtering.
    Supports dynamic attribute filtering via group-specific parameters.
    """
    return await AssetService.list_assets(
        db, q=q, status=status, asset_type_id=asset_type_id,
        group_code=group_code, location_id=location_id,
        department_id=department_id, page=page, size=size,
        sort_by=sort_by, sort_dir=sort_dir,
    )


@router.post("", response_model=AssetOut, status_code=201)
async def create_asset(
    data: AssetCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Create a new asset. Validates dynamic_attributes against the
    group's attribute_definitions schema.
    """
    return await AssetService.create_asset(db, data, created_by=current_user.id)


@router.get("/export")
async def export_assets(
    format: str = Query("xlsx", description="xlsx"),
    status: Optional[str] = Query(None),
    group_code: Optional[str] = Query(None),
    columns: Optional[List[str]] = Query(None, description="Danh sách cột cần xuất"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Export assets to Excel with optional column selection"""
    return await AssetService.export_assets(
        db, format=format, status=status, group_code=group_code, columns=columns
    )


@router.get("/stats/by-location")
async def assets_by_location(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Asset count and value grouped by project site/location"""
    return await AssetService.get_stats_by_location(db)


@router.get("/alerts")
async def get_alerts(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Returns assets requiring attention:
    - Registration expiry (Hạn đăng kiểm) within 30 days
    - Calibration expiry (Hạn hiệu chuẩn) within 30 days
    - Assets in maintenance > 30 days
    """
    return await AssetService.get_alerts(db)


@router.get("/{asset_id}", response_model=AssetOut)
async def get_asset(
    asset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    asset = await AssetService.get_by_id(db, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


@router.get("/code/{asset_code}", response_model=AssetOut)
async def get_asset_by_code(
    asset_code: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Lookup by Mã TS (e.g. MRN1, ACN1)"""
    asset = await AssetService.get_by_code(db, asset_code)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


@router.post("/{asset_id}/duplicate", response_model=AssetOut, status_code=201)
async def duplicate_asset(
    asset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await AssetService.duplicate_asset(db, asset_id, created_by=current_user.id)


@router.put("/{asset_id}", response_model=AssetOut)
async def update_asset(
    asset_id: uuid.UUID,
    data: AssetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await AssetService.update_asset(db, asset_id, data, updated_by=current_user.id)


@router.delete("/{asset_id}", status_code=204)
async def delete_asset(
    asset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    await AssetService.delete_asset(db, asset_id)


@router.post("/upload-doc", status_code=201)
async def upload_doc(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    """Upload a document/image file for use in dynamic attributes (chứng từ liên quan)."""
    _DOC_DIR = os.environ.get("UPLOAD_DIR", "/app/uploads/assets").replace("/assets", "/docs")
    os.makedirs(_DOC_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename)[1].lower() or ".bin"
    unique_name = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(_DOC_DIR, unique_name)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    return {"url": f"/uploads/docs/{unique_name}", "filename": file.filename, "size": len(content)}


@router.post("/{asset_id}/upload-image", response_model=AssetOut)
async def upload_image(
    asset_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await AssetService.upload_image(db, asset_id, file, _UPLOAD_DIR)


@router.post("/{asset_id}/attachments", status_code=201)
async def upload_attachment(
    asset_id: uuid.UUID,
    file: UploadFile = File(...),
    attachment_type: str = Query("OTHER"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Upload file attachment (invoice, warranty card, inspection report)"""
    return await AssetService.add_attachment(
        db, asset_id, file, attachment_type, uploaded_by=current_user.id
    )


@router.get("/{asset_id}/attachments")
async def get_attachments(
    asset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await AssetService.get_attachments(db, asset_id)


@router.get("/{asset_id}/lifecycle")
async def get_asset_lifecycle(
    asset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Full audit trail for a single asset"""
    return await AssetService.get_lifecycle(db, asset_id)


@router.get("/{asset_id}/qr-image")
async def get_qr_image(
    asset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Generate QR code image (PNG) for asset label printing"""
    return await AssetService.generate_qr_image(db, asset_id)
