"""
HR Personnel Models
Quản lý nhân sự - liên kết với departments, assets, users
"""
import uuid
from datetime import datetime, date
from decimal import Decimal
from typing import Optional

from sqlalchemy import String, Integer, Boolean, DateTime, Date, Numeric, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.session import Base


class Position(Base):
    """Vị trí công việc (VD: Kỹ sư phần mềm, Kế toán trưởng)"""
    __tablename__ = "positions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("positions.id"))
    salary_from: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2))
    salary_to: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PositionTitle(Base):
    """Chức danh (VD: Giám đốc, Trưởng phòng, Nhân viên)"""
    __tablename__ = "position_titles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[Optional[str]] = mapped_column(String(50), unique=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ContractType(Base):
    """Loại hợp đồng lao động (VD: Thử việc, Xác định thời hạn 1 năm, Không xác định thời hạn)"""
    __tablename__ = "contract_types"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    months: Mapped[Optional[int]] = mapped_column(Integer)  # Thời hạn (tháng), NULL = không xác định
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class EmployeeContract(Base):
    """Hợp đồng lao động của nhân viên"""
    __tablename__ = "employee_contracts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    contract_code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    personnel_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("personnel.id", ondelete="CASCADE"), nullable=False)
    contract_type_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("contract_types.id"))
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("departments.id"))
    position_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("positions.id"))
    job_title_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("position_titles.id"))
    date_start: Mapped[date] = mapped_column(Date, nullable=False)
    date_finish: Mapped[Optional[date]] = mapped_column(Date)  # NULL = không xác định thời hạn
    salary: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2))
    salary_allowances: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 2), default=0)
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE")  # ACTIVE/EXPIRED/LIQUIDATED/PENDING
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))

    # Relationships
    contract_type: Mapped[Optional["ContractType"]] = relationship("ContractType")
    department: Mapped[Optional["Department"]] = relationship("Department")
    position: Mapped[Optional["Position"]] = relationship("Position")
    job_title: Mapped[Optional["PositionTitle"]] = relationship("PositionTitle")


# Import Department for relationship (avoid circular import)
from app.models.assets import Department  # noqa: E402
