"""
Timesheet - Bảng chấm công
"""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import String, Integer, Boolean, DateTime, Date, Numeric, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.session import Base


class TimesheetRow(Base):
    """Một dòng chấm công: 1 nhân viên × 1 tháng × 1 loại công việc (row_index)"""
    __tablename__ = "timesheet_rows"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    personnel_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("personnel.id", ondelete="CASCADE"), nullable=False, index=True
    )
    year:  Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)

    # Nhiều dòng cho 1 nhân viên (việc chính, việc phụ, máy cụ thể...)
    row_index: Mapped[int] = mapped_column(Integer, default=0)
    row_label: Mapped[Optional[str]] = mapped_column(String(100))        # "Việc chính", "LU RUNG 70SA"
    work_description: Mapped[Optional[str]] = mapped_column(Text)        # Diễn giải công việc

    # Giờ làm từng ngày: {"1": 8.0, "5": 4.0, ...} — chỉ lưu ngày có giờ
    hours: Mapped[Optional[dict]] = mapped_column(JSONB, default=dict)

    leave_days: Mapped[Decimal] = mapped_column(Numeric(4, 1), default=0)  # Ngày nghỉ phép (nhập tay)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    # UNIQUE INDEX được tạo trong migration SQL
