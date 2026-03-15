"""
Pydantic schemas for Asset Management API
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ============================================================
# ASSET TYPE & ATTRIBUTE SCHEMAS
# ============================================================

class AttributeDefinitionOut(BaseModel):
    id: UUID
    field_key: str
    field_label: str
    field_type: str
    field_unit: Optional[str]
    is_required: bool
    is_searchable: bool = False
    show_in_table: bool = False
    display_order: int
    select_options: Optional[List[str]]
    validation_rules: Optional[Dict]

    class Config:
        from_attributes = True


class AssetTypeGroupOut(BaseModel):
    id: UUID
    code: str
    name: str
    allocation_type: str
    asset_attribute: Optional[str]
    tracking_unit: Optional[str]
    attributes: List[AttributeDefinitionOut] = []

    class Config:
        from_attributes = True


# ============================================================
# ASSET SCHEMAS
# ============================================================

class AssetBase(BaseModel):
    asset_code: str = Field(..., description="Mã tài sản, e.g. MRN1")
    name: str = Field(..., description="Tên tài sản")
    barcode: Optional[str] = None
    status: str = "PENDING_ALLOCATION"
    asset_type_id: UUID
    legal_entity_id: Optional[UUID] = None
    managing_department_id: Optional[UUID] = None
    current_location_id: Optional[UUID] = None
    supplier_id: Optional[UUID] = None
    model_series: Optional[str] = None
    year_manufactured: Optional[str] = None
    country_manufactured: Optional[str] = None
    purchase_price: Optional[Decimal] = None
    original_value: Optional[Decimal] = None
    depreciation_months: int = 0
    loan_amount: Optional[Decimal] = None
    purchase_date: Optional[date] = None
    warranty_end_date: Optional[date] = None
    expiry_date: Optional[date] = None
    warranty_months: int = 0
    chassis_number: Optional[str] = None           # Số Khung
    engine_number: Optional[str] = None            # Số Động cơ
    license_plate: Optional[str] = None            # Biển số xe
    registration_expiry: Optional[date] = None     # Hạn đăng kiểm
    quantity: int = 1
    description: Optional[str] = None
    condition_description: Optional[str] = None
    tags: Optional[List[str]] = None
    dynamic_attributes: Dict[str, Any] = Field(
        default={},
        description="Flexible attributes per asset group. E.g. {'gio_may': 1500, 'han_hieu_chuan': '2026-12-31'}"
    )


class AssetCreate(AssetBase):
    pass


class AssetUpdate(BaseModel):
    asset_code: Optional[str] = None
    name: Optional[str] = None
    barcode: Optional[str] = None
    asset_type_id: Optional[UUID] = None
    managing_department_id: Optional[UUID] = None
    current_location_id: Optional[UUID] = None
    supplier_id: Optional[UUID] = None
    model_series: Optional[str] = None
    year_manufactured: Optional[str] = None
    country_manufactured: Optional[str] = None
    purchase_price: Optional[Decimal] = None
    original_value: Optional[Decimal] = None
    depreciation_months: Optional[int] = None
    loan_amount: Optional[Decimal] = None
    purchase_date: Optional[date] = None
    warranty_end_date: Optional[date] = None
    expiry_date: Optional[date] = None
    warranty_months: Optional[int] = None
    chassis_number: Optional[str] = None
    engine_number: Optional[str] = None
    license_plate: Optional[str] = None
    registration_expiry: Optional[date] = None
    quantity: Optional[int] = None
    status: Optional[str] = None
    condition_description: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    dynamic_attributes: Optional[Dict[str, Any]] = None


class AssetOut(AssetBase):
    id: UUID
    asset_type_id: Optional[UUID] = None       # override parent — allow NULL
    depreciation_months: Optional[int] = 0     # override parent — allow NULL from DB
    warranty_months: Optional[int] = 0         # override parent — allow NULL from DB
    quantity: Optional[int] = 1                # override parent — allow NULL from DB
    qr_code: Optional[str]
    status: str
    qty_allocated: int
    qty_recovered: int
    qty_maintenance: int
    qty_liquidated: int
    qty_lost: int
    qty_cancelled: int
    qty_broken: int
    current_value: Optional[Decimal]
    depreciation_value: Optional[Decimal]
    asset_image_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    # Nested / joined
    asset_type_name: Optional[str] = None
    location_name: Optional[str] = None
    department_name: Optional[str] = None
    supplier_name: Optional[str] = None
    current_personnel_name: Optional[str] = None

    class Config:
        from_attributes = True


class AssetListOut(BaseModel):
    total: int
    page: int
    size: int
    items: List[AssetOut]


class AssetSearchParams(BaseModel):
    q: Optional[str] = None                        # text search
    status: Optional[str] = None
    asset_type_id: Optional[UUID] = None
    group_code: Optional[str] = None
    location_id: Optional[UUID] = None
    department_id: Optional[UUID] = None
    # Dynamic attribute filters (pass as JSON string)
    attr_filter: Optional[str] = None             # e.g. '{"gio_may_min": 1000, "han_hieu_chuan_before": "2026-01-01"}'
    page: int = 1
    size: int = 20


# ============================================================
# TRANSFER ORDER SCHEMAS
# ============================================================

class TransferOrderItemCreate(BaseModel):
    asset_id: UUID
    quantity: int = 1
    condition_before: Optional[str] = None
    notes: Optional[str] = None


class TransferOrderCreate(BaseModel):
    order_type: str = Field(..., description="ALLOCATION | RECOVERY | TRANSFER | MAINTENANCE_OUT | LIQUIDATION")
    from_location_id: Optional[UUID] = None
    to_location_id: Optional[UUID] = None
    from_department_id: Optional[UUID] = None
    to_department_id: Optional[UUID] = None
    assigned_personnel_id: Optional[UUID] = None
    planned_date: Optional[date] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    items: List[TransferOrderItemCreate]


class QRVerificationRequest(BaseModel):
    qr_verification_token: str
    gps_coordinates: Optional[Dict[str, float]] = None    # {"lat": 10.x, "lng": 106.x}
    confirmed_by_user_id: UUID


class TransferOrderOut(BaseModel):
    id: UUID
    order_code: str
    order_type: str
    status: str
    qr_verification_token: Optional[str] = None
    qr_verified_at: Optional[datetime] = None
    from_location_name: Optional[str] = None
    to_location_name: Optional[str] = None
    assigned_personnel_name: Optional[str] = None
    planned_date: Optional[date] = None
    completed_at: Optional[datetime] = None
    reason: Optional[str] = None
    item_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# LIFECYCLE / AUDIT TRAIL SCHEMAS
# ============================================================

class LifecycleEventOut(BaseModel):
    id: UUID
    event_type: str
    event_description: Optional[str]
    performed_by_name: Optional[str]
    from_location_name: Optional[str]
    to_location_name: Optional[str]
    from_personnel_name: Optional[str]
    to_personnel_name: Optional[str]
    changed_fields: Optional[Dict]
    gps_coordinates: Optional[Dict]
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# MAINTENANCE SCHEMAS
# ============================================================

class MaintenanceCreate(BaseModel):
    asset_id: UUID
    maintenance_type: str
    service_provider: Optional[str] = None
    technician_name: Optional[str] = None
    scheduled_date: Optional[date] = None
    issue_description: Optional[str] = None
    cost: Optional[Decimal] = None
    meter_reading_before: Optional[Dict] = None    # {"gio_may": 1500}


class MaintenanceComplete(BaseModel):
    completion_date: date
    work_performed: str
    parts_replaced: Optional[str] = None
    cost: Optional[Decimal] = None
    meter_reading_after: Optional[Dict] = None     # {"gio_may": 1510}


# ============================================================
# DASHBOARD / ANALYTICS SCHEMAS
# ============================================================

class DashboardSummary(BaseModel):
    total_assets: int
    total_value: Decimal
    by_status: Dict[str, int]
    by_group: Dict[str, int]
    by_location: Dict[str, int]
    pending_registration_renewal: int             # Xe hết hạn đăng kiểm
    pending_calibration: int                      # Thiết bị hết hạn hiệu chuẩn
    in_maintenance: int
    recent_transfers: int                         # Transfers in last 30 days
