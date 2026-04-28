"""
Pydantic Schemas - Quản lý nhân sự
"""
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


# ============================================================
# POSITION - Vị trí công việc
# ============================================================

class PositionBase(BaseModel):
    code: str = Field(..., max_length=50)
    title: str = Field(..., max_length=255)
    description: Optional[str] = None
    parent_id: Optional[UUID] = None
    salary_from: Optional[Decimal] = None
    salary_to: Optional[Decimal] = None
    is_active: bool = True


class PositionCreate(PositionBase):
    pass


class PositionUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    parent_id: Optional[UUID] = None
    salary_from: Optional[Decimal] = None
    salary_to: Optional[Decimal] = None
    is_active: Optional[bool] = None


class PositionOut(PositionBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# POSITION TITLE - Chức danh
# ============================================================

class PositionTitleBase(BaseModel):
    code: Optional[str] = Field(None, max_length=50)
    title: str = Field(..., max_length=255)
    priority: int = 0
    is_active: bool = True


class PositionTitleCreate(PositionTitleBase):
    pass


class PositionTitleUpdate(BaseModel):
    title: Optional[str] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None


class PositionTitleOut(PositionTitleBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# CONTRACT TYPE - Loại hợp đồng
# ============================================================

class ContractTypeBase(BaseModel):
    code: str = Field(..., max_length=50)
    title: str = Field(..., max_length=255)
    months: Optional[int] = None  # None = không xác định thời hạn
    is_active: bool = True


class ContractTypeCreate(ContractTypeBase):
    pass


class ContractTypeUpdate(BaseModel):
    title: Optional[str] = None
    months: Optional[int] = None
    is_active: Optional[bool] = None


class ContractTypeOut(ContractTypeBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# EMPLOYEE CONTRACT - Hợp đồng lao động
# ============================================================

class EmployeeContractBase(BaseModel):
    contract_code: str = Field(..., max_length=100)
    personnel_id: UUID
    contract_type_id: Optional[UUID] = None
    department_id: Optional[UUID] = None
    position_id: Optional[UUID] = None
    job_title_id: Optional[UUID] = None
    date_start: date
    date_finish: Optional[date] = None
    salary: Optional[Decimal] = None
    salary_allowances: Optional[Decimal] = Decimal("0")
    status: str = "ACTIVE"
    notes: Optional[str] = None


class EmployeeContractCreate(EmployeeContractBase):
    pass


class EmployeeContractUpdate(BaseModel):
    contract_type_id: Optional[UUID] = None
    department_id: Optional[UUID] = None
    position_id: Optional[UUID] = None
    job_title_id: Optional[UUID] = None
    date_start: Optional[date] = None
    date_finish: Optional[date] = None
    salary: Optional[Decimal] = None
    salary_allowances: Optional[Decimal] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class EmployeeContractOut(EmployeeContractBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
    contract_type: Optional[ContractTypeOut] = None

    class Config:
        from_attributes = True


# ============================================================
# PERSONNEL - Nhân sự (inline refs)
# ============================================================

class DepartmentRef(BaseModel):
    id: UUID
    name: str
    code: str

    class Config:
        from_attributes = True


class PositionRef(BaseModel):
    id: UUID
    title: str
    code: str

    class Config:
        from_attributes = True


class PositionTitleRef(BaseModel):
    id: UUID
    title: str

    class Config:
        from_attributes = True


class PersonnelBase(BaseModel):
    employee_code: str = Field(..., max_length=50, description="Mã nhân viên")
    full_name: str = Field(..., max_length=255, description="Họ và tên")

    # Cá nhân
    birthday: Optional[date] = None
    gender: Optional[str] = Field(None, description="MALE / FEMALE / OTHER")
    marital_status: Optional[str] = Field(None, description="SINGLE / MARRIED / DIVORCED / WIDOWED")
    private_code: Optional[str] = Field(None, max_length=20, description="Số CMND/CCCD")
    private_code_date: Optional[date] = None
    private_code_place: Optional[str] = None
    nationality: Optional[str] = None
    ethnicity: Optional[str] = None

    # Liên hệ
    phone: Optional[str] = Field(None, max_length=20)
    mobile: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=255)
    home_address: Optional[str] = None
    current_address: Optional[str] = None
    photo_url: Optional[str] = None

    # Công việc
    department_id: Optional[UUID] = None
    position_id:   Optional[UUID] = None
    job_title_id:  Optional[UUID] = None
    position:      Optional[str]  = None   # chức vụ text (tương thích cũ)
    job_status: Optional[str] = Field(None, description="PROBATION / OFFICIAL / RESIGNED / TERMINATED")
    job_date_join: Optional[date] = None
    job_date_try: Optional[date] = None
    job_reldate_join: Optional[date] = None
    job_date_out: Optional[date] = None
    job_out_reason: Optional[str] = None

    # Lương
    salary_method: Optional[str] = Field(None, description="FIXED / TIMESHEET / PIECE")
    salary_real: Optional[Decimal] = None

    # Học vấn & Chuyên môn
    education_level: Optional[str] = None
    professional_level: Optional[str] = None
    training_school: Optional[str] = None
    work_history: Optional[str] = None

    # Bảo hiểm & Thuế
    tax_code: Optional[str] = None
    social_insurance_number: Optional[str] = None
    labor_contract_number: Optional[str] = None

    # Liên hệ khẩn cấp
    emergency_phone_1: Optional[str] = None
    emergency_phone_2: Optional[str] = None

    description: Optional[str] = None
    is_active: bool = True


class PersonnelCreate(PersonnelBase):
    pass


class PersonnelUpdate(BaseModel):
    full_name: Optional[str] = None
    birthday: Optional[date] = None
    gender: Optional[str] = None
    marital_status: Optional[str] = None
    private_code: Optional[str] = None
    private_code_date: Optional[date] = None
    private_code_place: Optional[str] = None
    nationality: Optional[str] = None
    ethnicity: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    home_address: Optional[str] = None
    current_address: Optional[str] = None
    photo_url: Optional[str] = None
    department_id: Optional[UUID]  = None
    position_id:   Optional[UUID]  = None
    job_title_id:  Optional[UUID]  = None
    position:      Optional[str]   = None   # text đồng bộ từ position_id
    job_status:    Optional[str]   = None
    job_date_join: Optional[date] = None
    job_date_try: Optional[date] = None
    job_reldate_join: Optional[date] = None
    job_date_out: Optional[date] = None
    job_out_reason: Optional[str] = None
    salary_method: Optional[str] = None
    salary_real: Optional[Decimal] = None
    education_level: Optional[str] = None
    professional_level: Optional[str] = None
    training_school: Optional[str] = None
    work_history: Optional[str] = None
    tax_code: Optional[str] = None
    social_insurance_number: Optional[str] = None
    labor_contract_number: Optional[str] = None
    emergency_phone_1: Optional[str] = None
    emergency_phone_2: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class PersonnelOut(PersonnelBase):
    id: UUID
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PersonnelDetail(PersonnelOut):
    """Chi tiết nhân sự kèm thông tin phòng ban, vị trí, hợp đồng"""
    contracts: List[EmployeeContractOut] = []

    class Config:
        from_attributes = True


# ============================================================
# PAGINATION
# ============================================================

class PaginatedPersonnel(BaseModel):
    items: List[PersonnelOut]
    total: int
    page: int
    page_size: int
    total_pages: int
