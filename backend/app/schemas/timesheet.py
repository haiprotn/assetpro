from __future__ import annotations
from datetime import datetime
from decimal import Decimal
from typing import Optional, Any
from uuid import UUID
from pydantic import BaseModel


class TimesheetRowIn(BaseModel):
    id: Optional[UUID] = None
    personnel_id: UUID
    year: int
    month: int
    row_index: int = 0
    row_label: Optional[str] = None
    work_description: Optional[str] = None
    hours: dict[str, Any] = {}   # {"1": 8.0, "5": 4.5, ...}
    leave_days: float = 0.0
    notes: Optional[str] = None


class TimesheetRowOut(BaseModel):
    id: UUID
    personnel_id: UUID
    year: int
    month: int
    row_index: int
    row_label: Optional[str]
    work_description: Optional[str]
    hours: dict[str, Any]
    leave_days: float
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    # Joined from personnel / departments
    full_name: Optional[str] = None
    employee_code: Optional[str] = None
    position_text: Optional[str] = None
    department_name: Optional[str] = None
    mobile: Optional[str] = None
    phone: Optional[str] = None

    model_config = {"from_attributes": True}
