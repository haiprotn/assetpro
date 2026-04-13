"""
Timesheet / Chấm công
"""
import uuid
from datetime import datetime, date
from decimal import Decimal
from typing import Optional

from sqlalchemy import String, Boolean, DateTime, Date, Numeric, Text, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.session import Base


class TimesheetEntry(Base):
    """Một dòng chấm công: 1 nhân viên × 1 ngày (× 1 thiết bị cho khối vận hành)"""
    __tablename__ = "timesheet_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    personnel_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("personnel.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)

    # ── Khối nhân sự chính (OFFICE) ──────────────────────────
    hours_regular: Mapped[Decimal] = mapped_column(Numeric(4, 1), default=8)
    is_leave: Mapped[bool] = mapped_column(Boolean, default=False)
    overtime_hours: Mapped[Decimal] = mapped_column(Numeric(4, 1), default=0)
    overtime_over_2h: Mapped[bool] = mapped_column(Boolean, default=False)
    work_days: Mapped[Decimal] = mapped_column(Numeric(4, 2), default=1)
    work_description: Mapped[Optional[str]] = mapped_column(Text)

    # ── Khối vận hành / lái xe (OPERATOR) ───────────────────
    # equipment_name = NULL  →  loại OFFICE; có giá trị  →  loại OPERATOR
    equipment_name: Mapped[Optional[str]] = mapped_column(String(255))
    hours_main: Mapped[Decimal] = mapped_column(Numeric(4, 1), default=0)
    hours_secondary: Mapped[Decimal] = mapped_column(Numeric(4, 1), default=0)

    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Unique: 1 nhân viên chỉ có 1 dòng mỗi ngày khi là OFFICE (equipment NULL)
    # Unique: 1 nhân viên × ngày × thiết bị khi là OPERATOR
    # → dùng 2 partial unique index (tạo trong migration SQL)
