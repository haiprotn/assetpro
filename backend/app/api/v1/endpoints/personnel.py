"""
Personnel API Endpoints - Quản lý nhân sự
"""
import math
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, or_, and_
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.core.auth import get_current_user
from app.models.assets import Personnel, Department
from app.models.personnel import Position, PositionTitle, ContractType, EmployeeContract
from app.schemas.personnel import (
    PersonnelCreate, PersonnelUpdate, PersonnelOut, PersonnelDetail, PaginatedPersonnel,
    PositionCreate, PositionUpdate, PositionOut,
    PositionTitleCreate, PositionTitleUpdate, PositionTitleOut,
    ContractTypeCreate, ContractTypeUpdate, ContractTypeOut,
    EmployeeContractCreate, EmployeeContractUpdate, EmployeeContractOut,
)

router = APIRouter()


# ════════════════════════════════════════════════════════════
# PERSONNEL - Nhân viên
# ════════════════════════════════════════════════════════════

@router.get("", response_model=PaginatedPersonnel, summary="Danh sách nhân viên")
async def list_personnel(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, description="Tìm theo tên, mã, email"),
    department_id: Optional[uuid.UUID] = Query(None),
    job_status: Optional[str] = Query(None, description="PROBATION/OFFICIAL/RESIGNED/TERMINATED"),
    is_active: Optional[bool] = Query(None),
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = select(Personnel)

    if search:
        like = f"%{search}%"
        q = q.where(or_(
            Personnel.full_name.ilike(like),
            Personnel.employee_code.ilike(like),
            Personnel.email.ilike(like),
            Personnel.phone.ilike(like),
        ))
    if department_id:
        q = q.where(Personnel.department_id == department_id)
    if job_status:
        q = q.where(Personnel.job_status == job_status)
    if is_active is not None:
        q = q.where(Personnel.is_active == is_active)

    # Count
    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar_one()

    # Paginate
    q = q.order_by(Personnel.full_name).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(q)).scalars().all()

    return PaginatedPersonnel(
        items=rows,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
    )


@router.get("/all", response_model=list[PersonnelOut], summary="Tất cả nhân viên (cho dropdown)")
async def list_personnel_all(
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(Personnel)
        .where(Personnel.is_active == True)
        .order_by(Personnel.full_name)
    )
    return result.scalars().all()


@router.post("", response_model=PersonnelOut, status_code=status.HTTP_201_CREATED, summary="Thêm nhân viên")
async def create_personnel(
    body: PersonnelCreate,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Kiểm tra mã nhân viên trùng
    exists = (await db.execute(
        select(Personnel).where(Personnel.employee_code == body.employee_code)
    )).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=400, detail=f"Mã nhân viên '{body.employee_code}' đã tồn tại")

    p = Personnel(**body.model_dump(), created_by=current_user.id)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


@router.get("/{personnel_id}", response_model=PersonnelDetail, summary="Chi tiết nhân viên")
async def get_personnel(
    personnel_id: uuid.UUID,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    p = (await db.execute(
        select(Personnel).where(Personnel.id == personnel_id)
    )).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhân viên")

    # Load contracts
    contracts = (await db.execute(
        select(EmployeeContract)
        .options(selectinload(EmployeeContract.contract_type))
        .where(EmployeeContract.personnel_id == personnel_id)
        .order_by(EmployeeContract.date_start.desc())
    )).scalars().all()

    result = PersonnelDetail.model_validate(p)
    result.contracts = [EmployeeContractOut.model_validate(c) for c in contracts]
    return result


@router.put("/{personnel_id}", response_model=PersonnelOut, summary="Cập nhật nhân viên")
async def update_personnel(
    personnel_id: uuid.UUID,
    body: PersonnelUpdate,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    p = (await db.execute(
        select(Personnel).where(Personnel.id == personnel_id)
    )).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhân viên")

    for k, v in body.model_dump(exclude_none=True).items():
        setattr(p, k, v)
    p.updated_by = current_user.id
    await db.commit()
    await db.refresh(p)
    return p


@router.delete("/{personnel_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Xóa / vô hiệu hóa nhân viên")
async def delete_personnel(
    personnel_id: uuid.UUID,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    p = (await db.execute(
        select(Personnel).where(Personnel.id == personnel_id)
    )).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhân viên")

    p.is_active = False
    p.updated_by = current_user.id
    await db.commit()


# ════════════════════════════════════════════════════════════
# EMPLOYEE CONTRACTS - Hợp đồng lao động
# ════════════════════════════════════════════════════════════

@router.get("/{personnel_id}/contracts", response_model=list[EmployeeContractOut], summary="HĐ của nhân viên")
async def list_contracts(
    personnel_id: uuid.UUID,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    rows = (await db.execute(
        select(EmployeeContract)
        .options(selectinload(EmployeeContract.contract_type))
        .where(EmployeeContract.personnel_id == personnel_id)
        .order_by(EmployeeContract.date_start.desc())
    )).scalars().all()
    return rows


@router.post("/{personnel_id}/contracts", response_model=EmployeeContractOut, status_code=201, summary="Thêm hợp đồng")
async def create_contract(
    personnel_id: uuid.UUID,
    body: EmployeeContractCreate,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    # Kiểm tra nhân viên tồn tại
    p = (await db.execute(select(Personnel).where(Personnel.id == personnel_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Không tìm thấy nhân viên")

    # Kiểm tra mã hợp đồng
    dup = (await db.execute(
        select(EmployeeContract).where(EmployeeContract.contract_code == body.contract_code)
    )).scalar_one_or_none()
    if dup:
        raise HTTPException(status_code=400, detail=f"Mã hợp đồng '{body.contract_code}' đã tồn tại")

    data = body.model_dump()
    data["personnel_id"] = personnel_id
    data["created_by"] = current_user.id
    c = EmployeeContract(**data)
    db.add(c)
    await db.commit()
    await db.refresh(c)

    # Reload with relations
    c = (await db.execute(
        select(EmployeeContract)
        .options(selectinload(EmployeeContract.contract_type))
        .where(EmployeeContract.id == c.id)
    )).scalar_one()
    return c


@router.put("/contracts/{contract_id}", response_model=EmployeeContractOut, summary="Cập nhật hợp đồng")
async def update_contract(
    contract_id: uuid.UUID,
    body: EmployeeContractUpdate,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    c = (await db.execute(
        select(EmployeeContract).where(EmployeeContract.id == contract_id)
    )).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Không tìm thấy hợp đồng")

    for k, v in body.model_dump(exclude_none=True).items():
        setattr(c, k, v)
    await db.commit()
    await db.refresh(c)

    c = (await db.execute(
        select(EmployeeContract)
        .options(selectinload(EmployeeContract.contract_type))
        .where(EmployeeContract.id == contract_id)
    )).scalar_one()
    return c


@router.delete("/contracts/{contract_id}", status_code=204, summary="Xóa hợp đồng")
async def delete_contract(
    contract_id: uuid.UUID,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    c = (await db.execute(
        select(EmployeeContract).where(EmployeeContract.id == contract_id)
    )).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Không tìm thấy hợp đồng")
    await db.delete(c)
    await db.commit()


# ════════════════════════════════════════════════════════════
# POSITIONS - Vị trí công việc
# ════════════════════════════════════════════════════════════

@router.get("/positions/list", response_model=list[PositionOut], summary="Danh sách vị trí")
async def list_positions(
    is_active: Optional[bool] = Query(True),
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = select(Position).order_by(Position.title)
    if is_active is not None:
        q = q.where(Position.is_active == is_active)
    rows = (await db.execute(q)).scalars().all()
    return rows


@router.post("/positions", response_model=PositionOut, status_code=201, summary="Thêm vị trí")
async def create_position(
    body: PositionCreate,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    dup = (await db.execute(select(Position).where(Position.code == body.code))).scalar_one_or_none()
    if dup:
        raise HTTPException(status_code=400, detail=f"Mã vị trí '{body.code}' đã tồn tại")
    p = Position(**body.model_dump())
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


@router.put("/positions/{position_id}", response_model=PositionOut, summary="Cập nhật vị trí")
async def update_position(
    position_id: uuid.UUID,
    body: PositionUpdate,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    p = (await db.execute(select(Position).where(Position.id == position_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Không tìm thấy vị trí")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(p, k, v)
    await db.commit()
    await db.refresh(p)
    return p


@router.delete("/positions/{position_id}", status_code=204, summary="Xóa vị trí")
async def delete_position(
    position_id: uuid.UUID,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    p = (await db.execute(select(Position).where(Position.id == position_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Không tìm thấy vị trí")
    p.is_active = False
    await db.commit()


# ════════════════════════════════════════════════════════════
# POSITION TITLES - Chức danh
# ════════════════════════════════════════════════════════════

@router.get("/job-titles/list", response_model=list[PositionTitleOut], summary="Danh sách chức danh")
async def list_job_titles(
    is_active: Optional[bool] = Query(True),
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = select(PositionTitle).order_by(PositionTitle.priority, PositionTitle.title)
    if is_active is not None:
        q = q.where(PositionTitle.is_active == is_active)
    rows = (await db.execute(q)).scalars().all()
    return rows


@router.post("/job-titles", response_model=PositionTitleOut, status_code=201, summary="Thêm chức danh")
async def create_job_title(
    body: PositionTitleCreate,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    p = PositionTitle(**body.model_dump())
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


@router.put("/job-titles/{title_id}", response_model=PositionTitleOut, summary="Cập nhật chức danh")
async def update_job_title(
    title_id: uuid.UUID,
    body: PositionTitleUpdate,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    p = (await db.execute(select(PositionTitle).where(PositionTitle.id == title_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Không tìm thấy chức danh")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(p, k, v)
    await db.commit()
    await db.refresh(p)
    return p


@router.delete("/job-titles/{title_id}", status_code=204, summary="Xóa chức danh")
async def delete_job_title(
    title_id: uuid.UUID,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    p = (await db.execute(select(PositionTitle).where(PositionTitle.id == title_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Không tìm thấy chức danh")
    p.is_active = False
    await db.commit()


# ════════════════════════════════════════════════════════════
# CONTRACT TYPES - Loại hợp đồng
# ════════════════════════════════════════════════════════════

@router.get("/contract-types/list", response_model=list[ContractTypeOut], summary="Danh sách loại HĐ")
async def list_contract_types(
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    rows = (await db.execute(
        select(ContractType).where(ContractType.is_active == True).order_by(ContractType.title)
    )).scalars().all()
    return rows


@router.post("/contract-types", response_model=ContractTypeOut, status_code=201, summary="Thêm loại HĐ")
async def create_contract_type(
    body: ContractTypeCreate,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    dup = (await db.execute(select(ContractType).where(ContractType.code == body.code))).scalar_one_or_none()
    if dup:
        raise HTTPException(status_code=400, detail=f"Mã loại HĐ '{body.code}' đã tồn tại")
    c = ContractType(**body.model_dump())
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c


@router.put("/contract-types/{ct_id}", response_model=ContractTypeOut, summary="Cập nhật loại HĐ")
async def update_contract_type(
    ct_id: uuid.UUID,
    body: ContractTypeUpdate,
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    c = (await db.execute(select(ContractType).where(ContractType.id == ct_id))).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Không tìm thấy loại hợp đồng")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(c, k, v)
    await db.commit()
    await db.refresh(c)
    return c
