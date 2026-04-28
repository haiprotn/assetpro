from __future__ import annotations
from datetime import datetime, date
from typing import Optional, Any
from uuid import UUID
from pydantic import BaseModel


class AttendanceUpsert(BaseModel):
    check_in: Optional[str] = None          # "HH:MM" or null
    check_out: Optional[str] = None         # "HH:MM" or null
    total_hours: float = 0.0
    late_minutes: int = 0
    early_leave_minutes: int = 0
    overtime_hours: float = 0.0
    status: str = "present"                 # present / absent / leave / holiday
    notes: Optional[str] = None


class AttendanceOut(BaseModel):
    id: UUID
    personnel_id: UUID
    date: date
    check_in: Optional[Any] = None          # returned as "HH:MM" string
    check_out: Optional[Any] = None
    total_hours: float
    late_minutes: int
    early_leave_minutes: int
    overtime_hours: float
    status: str
    notes: Optional[str] = None
    full_name: Optional[str] = None
    employee_code: Optional[str] = None
    department_name: Optional[str] = None
    position_text: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class WorkLogIn(BaseModel):
    personnel_id:  UUID
    date:          date
    department_id: UUID
    task_type:     str = "main"             # main / sub
    hours:         float
    notes:         Optional[str] = None


class WorkLogOut(BaseModel):
    id:              UUID
    personnel_id:    UUID
    date:            date
    department_id:   UUID
    department_name: Optional[str] = None
    department_code: Optional[str] = None
    task_type:       str
    hours:           float
    notes:           Optional[str] = None
    created_at:      datetime
    updated_at:      datetime
    model_config = {"from_attributes": True}
