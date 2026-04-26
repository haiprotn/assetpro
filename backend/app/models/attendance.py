"""
Attendance (Chấm công) · WorkLog (Phân bổ công việc theo vị trí/công trình)
"""
import uuid
from datetime import datetime, date, time
from decimal import Decimal
from typing import Optional

from sqlalchemy import String, Integer, Boolean, DateTime, Date, Time, Numeric, Text, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.session import Base


class Attendance(Base):
    """Chấm công — 1 bản ghi / nhân viên / ngày"""
    __tablename__ = "attendances"
    __table_args__ = (
        UniqueConstraint("personnel_id", "date", name="uq_attendance_personnel_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    personnel_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("personnel.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    check_in: Mapped[Optional[time]] = mapped_column(Time)
    check_out: Mapped[Optional[time]] = mapped_column(Time)
    total_hours: Mapped[Decimal] = mapped_column(Numeric(4, 2), default=0)
    late_minutes: Mapped[int] = mapped_column(Integer, default=0)
    early_leave_minutes: Mapped[int] = mapped_column(Integer, default=0)
    overtime_hours: Mapped[Decimal] = mapped_column(Numeric(4, 2), default=0)
    # present / absent / leave / holiday
    status: Mapped[str] = mapped_column(String(20), default="present")
    notes: Mapped[Optional[str]] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class WorkLog(Base):
    """Phân bổ giờ làm theo công trình — nhiều dòng / người / ngày"""
    __tablename__ = "work_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    personnel_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("personnel.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    location_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("locations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    task_type: Mapped[str] = mapped_column(String(10), default="main")  # main / sub
    hours: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
