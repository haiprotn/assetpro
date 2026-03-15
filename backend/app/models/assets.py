"""
SQLAlchemy ORM Models
"""
import uuid
from datetime import datetime, date
from decimal import Decimal
from typing import Optional

from sqlalchemy import String, Integer, Boolean, DateTime, Date, Numeric, Text, ForeignKey, ARRAY
from sqlalchemy.dialects.postgresql import UUID, JSONB, INET
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.session import Base


class LegalEntity(Base):
    __tablename__ = "legal_entities"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    tax_code: Mapped[Optional[str]] = mapped_column(String(20))
    address: Mapped[Optional[str]] = mapped_column(Text)
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Department(Base):
    __tablename__ = "departments"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    legal_entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("legal_entities.id"))
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("departments.id"))
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    department_type: Mapped[Optional[str]] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Location(Base):
    __tablename__ = "locations"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    legal_entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("legal_entities.id"))
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[Optional[str]] = mapped_column(Text)
    province: Mapped[Optional[str]] = mapped_column(String(100))
    gps_lat: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 8))
    gps_lng: Mapped[Optional[Decimal]] = mapped_column(Numeric(11, 8))
    location_type: Mapped[Optional[str]] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AssetTypeGroup(Base):
    __tablename__ = "asset_type_groups"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    allocation_type: Mapped[str] = mapped_column(String(50), nullable=False)
    asset_attribute: Mapped[Optional[str]] = mapped_column(String(100))
    tracking_unit: Mapped[Optional[str]] = mapped_column(String(50))
    icon: Mapped[Optional[str]] = mapped_column(String(50))
    color: Mapped[Optional[str]] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    attributes: Mapped[list["AttributeDefinition"]] = relationship("AttributeDefinition", back_populates="group")


class AttributeDefinition(Base):
    __tablename__ = "attribute_definitions"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("asset_type_groups.id", ondelete="CASCADE"))
    field_key: Mapped[str] = mapped_column(String(100), nullable=False)
    field_label: Mapped[str] = mapped_column(String(255), nullable=False)
    field_type: Mapped[str] = mapped_column(String(50), nullable=False)
    field_unit: Mapped[Optional[str]] = mapped_column(String(50))
    is_required: Mapped[bool] = mapped_column(Boolean, default=False)
    is_searchable: Mapped[bool] = mapped_column(Boolean, default=False)
    show_in_table: Mapped[bool] = mapped_column(Boolean, default=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    select_options: Mapped[Optional[dict]] = mapped_column(JSONB)
    validation_rules: Mapped[Optional[dict]] = mapped_column(JSONB)
    group: Mapped["AssetTypeGroup"] = relationship("AssetTypeGroup", back_populates="attributes")


class AssetType(Base):
    __tablename__ = "asset_types"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("asset_type_groups.id"))
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    depreciation_months: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Supplier(Base):
    __tablename__ = "suppliers"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    country: Mapped[Optional[str]] = mapped_column(String(100))
    address: Mapped[Optional[str]] = mapped_column(Text)
    phone: Mapped[Optional[str]] = mapped_column(String(50))
    email: Mapped[Optional[str]] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Asset(Base):
    __tablename__ = "assets"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    barcode: Mapped[Optional[str]] = mapped_column(String(100))
    qr_code: Mapped[Optional[str]] = mapped_column(String(255), unique=True)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    legal_entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("legal_entities.id"))
    asset_type_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("asset_types.id"))
    managing_department_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("departments.id"))
    current_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("locations.id"))
    supplier_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("suppliers.id"))
    model_series: Mapped[Optional[str]] = mapped_column(String(255))
    year_manufactured: Mapped[Optional[str]] = mapped_column(String(10))
    country_manufactured: Mapped[Optional[str]] = mapped_column(String(100))
    purchase_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2))
    original_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2))
    current_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2))
    depreciation_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2), default=0)
    depreciation_months: Mapped[int] = mapped_column(Integer, default=0)
    loan_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2), default=0)
    purchase_date: Mapped[Optional[date]] = mapped_column(Date)
    report_increase_date: Mapped[Optional[date]] = mapped_column(Date)
    warranty_end_date: Mapped[Optional[date]] = mapped_column(Date)
    expiry_date: Mapped[Optional[date]] = mapped_column(Date)
    warranty_months: Mapped[int] = mapped_column(Integer, default=0)
    chassis_number: Mapped[Optional[str]] = mapped_column(String(100))
    engine_number: Mapped[Optional[str]] = mapped_column(String(100))
    registration_expiry: Mapped[Optional[date]] = mapped_column(Date)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    qty_allocated: Mapped[int] = mapped_column(Integer, default=0)
    qty_recovered: Mapped[int] = mapped_column(Integer, default=0)
    qty_maintenance: Mapped[int] = mapped_column(Integer, default=0)
    qty_liquidated: Mapped[int] = mapped_column(Integer, default=0)
    qty_lost: Mapped[int] = mapped_column(Integer, default=0)
    qty_cancelled: Mapped[int] = mapped_column(Integer, default=0)
    qty_broken: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(50), default="PENDING_ALLOCATION")
    condition_description: Mapped[Optional[str]] = mapped_column(Text)
    dynamic_attributes: Mapped[dict] = mapped_column(JSONB, default={})
    asset_image_url: Mapped[Optional[str]] = mapped_column(Text)
    description: Mapped[Optional[str]] = mapped_column(Text)
    tags: Mapped[Optional[list]] = mapped_column(ARRAY(String))
    attachment_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Personnel(Base):
    __tablename__ = "personnel"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("departments.id"))
    email: Mapped[Optional[str]] = mapped_column(String(255))
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    position: Mapped[Optional[str]] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TransferOrder(Base):
    __tablename__ = "transfer_orders"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    order_type: Mapped[str] = mapped_column(String(50), nullable=False)
    from_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("locations.id"))
    to_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("locations.id"))
    from_department_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("departments.id"))
    to_department_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("departments.id"))
    assigned_personnel_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("personnel.id"))
    qr_verification_token: Mapped[Optional[str]] = mapped_column(String(255), unique=True)
    qr_verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    qr_verified_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    qr_verification_location: Mapped[Optional[dict]] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(50), default="DRAFT")
    requested_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    approved_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text)
    reason: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    planned_date: Mapped[Optional[date]] = mapped_column(Date)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    items: Mapped[list["TransferOrderItem"]] = relationship("TransferOrderItem", back_populates="order")


class TransferOrderItem(Base):
    __tablename__ = "transfer_order_items"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transfer_order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("transfer_orders.id", ondelete="CASCADE"))
    asset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assets.id"))
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    item_qr_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    item_qr_confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    condition_before: Mapped[Optional[str]] = mapped_column(String(100))
    condition_after: Mapped[Optional[str]] = mapped_column(String(100))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    order: Mapped["TransferOrder"] = relationship("TransferOrder", back_populates="items")


class AssetLifecycleEvent(Base):
    __tablename__ = "asset_lifecycle_events"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("assets.id"))
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    transfer_order_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("transfer_orders.id"))
    performed_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    previous_state: Mapped[Optional[dict]] = mapped_column(JSONB)
    new_state: Mapped[Optional[dict]] = mapped_column(JSONB)
    changed_fields: Mapped[Optional[dict]] = mapped_column(JSONB)
    from_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("locations.id"))
    to_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("locations.id"))
    from_personnel_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("personnel.id"))
    to_personnel_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("personnel.id"))
    event_description: Mapped[Optional[str]] = mapped_column(Text)
    ip_address: Mapped[Optional[str]] = mapped_column(INET, nullable=True)
    gps_coordinates: Mapped[Optional[dict]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MaintenanceRecord(Base):
    __tablename__ = "maintenance_records"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assets.id"))
    maintenance_type: Mapped[Optional[str]] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(50), default="PENDING")
    service_provider: Mapped[Optional[str]] = mapped_column(String(255))
    technician_name: Mapped[Optional[str]] = mapped_column(String(255))
    scheduled_date: Mapped[Optional[date]] = mapped_column(Date)
    start_date: Mapped[Optional[date]] = mapped_column(Date)
    completion_date: Mapped[Optional[date]] = mapped_column(Date)
    cost: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2))
    issue_description: Mapped[Optional[str]] = mapped_column(Text)
    work_performed: Mapped[Optional[str]] = mapped_column(Text)
    parts_replaced: Mapped[Optional[str]] = mapped_column(Text)
    meter_reading_before: Mapped[Optional[dict]] = mapped_column(JSONB)
    meter_reading_after: Mapped[Optional[dict]] = mapped_column(JSONB)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AssetAttachment(Base):
    __tablename__ = "asset_attachments"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assets.id", ondelete="CASCADE"))
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_url: Mapped[str] = mapped_column(Text, nullable=False)
    file_type: Mapped[Optional[str]] = mapped_column(String(100))
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer)
    attachment_type: Mapped[Optional[str]] = mapped_column(String(50))
    uploaded_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    personnel_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("personnel.id"))
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), default="VIEWER")
    permissions: Mapped[Optional[dict]] = mapped_column(JSONB, default=[])
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
