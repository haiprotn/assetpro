from __future__ import annotations
from datetime import datetime, date
from decimal import Decimal
from typing import Optional
from uuid import UUID
from pydantic import BaseModel


class TimesheetEntryIn(BaseModel):
    personnel_id: UUID
    entry_date: date
    hours_regular: float = 8.0
    is_leave: bool = False
    overtime_hours: float = 0.0
    overtime_over_2h: bool = False
    work_days: float = 1.0
    work_description: Optional[str] = None
    equipment_name: Optional[str] = None   # None → OFFICE, có giá trị → OPERATOR
    hours_main: float = 0.0
    hours_secondary: float = 0.0
    notes: Optional[str] = None


class TimesheetEntryOut(BaseModel):
    id: UUID
    personnel_id: UUID
    entry_date: date
    hours_regular: float
    is_leave: bool
    overtime_hours: float
    overtime_over_2h: bool
    work_days: float
    work_description: Optional[str]
    equipment_name: Optional[str]
    hours_main: float
    hours_secondary: float
    notes: Optional[str]
    created_at: datetime
    # Thông tin nhân viên (join)
    full_name: Optional[str] = None
    employee_code: Optional[str] = None
    department_name: Optional[str] = None
    timesheet_type: Optional[str] = None   # OFFICE | OPERATOR (từ personnel)

    model_config = {"from_attributes": True}


class PersonnelTimesheetTypeUpdate(BaseModel):
    timesheet_type: str  # OFFICE | OPERATOR
