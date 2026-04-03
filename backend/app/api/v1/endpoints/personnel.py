"""
Personnel API Endpoints - Quản lý nhân sự
"""
import io
import math
import uuid
from datetime import date
from typing import Optional

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, or_
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

# ── Cấu hình cột Excel ───────────────────────────────────────
EXPORT_COLUMNS = [
    ("Mã nhân viên",        "employee_code"),
    ("Họ và tên",           "full_name"),
    ("Giới tính",           "gender"),
    ("Ngày sinh",           "birthday"),
    ("Số CMND/CCCD",        "private_code"),
    ("Ngày cấp",            "private_code_date"),
    ("Nơi cấp",             "private_code_place"),
    ("Quốc tịch",           "nationality"),
    ("Dân tộc",             "ethnicity"),
    ("Email",               "email"),
    ("Điện thoại",          "phone"),
    ("Di động",             "mobile"),
    ("Địa chỉ thường trú",  "home_address"),
    ("Địa chỉ hiện tại",    "current_address"),
    ("Phòng ban (tên)",         "_department_name"),
    ("Vị trí công việc (tên)", "_position_name"),
    ("Chức danh (tên)",        "_job_title_name"),
    ("Trạng thái LĐ",          "job_status"),
    ("Ngày vào làm",        "job_date_join"),
    ("Ngày thử việc",       "job_date_try"),
    ("Ngày chính thức",     "job_reldate_join"),
    ("Ngày nghỉ việc",      "job_date_out"),
    ("Lý do nghỉ",          "job_out_reason"),
    ("Hình thức lương",     "salary_method"),
    ("Mức lương (VNĐ)",     "salary_real"),
    ("Ghi chú",             "description"),
    ("Trạng thái TK",       "_is_active"),
]

IMPORT_REQUIRED = {"Mã nhân viên", "Họ và tên"}

GENDER_MAP   = {"nam": "MALE", "nữ": "FEMALE", "khác": "OTHER", "male": "MALE", "female": "FEMALE"}
STATUS_MAP   = {"thử việc": "PROBATION", "chính thức": "OFFICIAL", "đã nghỉ": "RESIGNED", "chấm dứt": "TERMINATED"}
SALARY_MAP   = {"lương cố định": "FIXED", "theo công": "TIMESHEET", "khoán sản phẩm": "PIECE",
                "fixed": "FIXED", "timesheet": "TIMESHEET", "piece": "PIECE"}

def _date_str(val):
    if val is None:
        return ""
    if isinstance(val, (date,)):
        return val.strftime("%d/%m/%Y")
    return str(val)

def _build_excel(rows, dept_map, pos_map=None, title_map=None):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Danh sách nhân sự"

    header_fill = PatternFill("solid", fgColor="1A2744")
    header_font = Font(bold=True, color="FFFFFF", size=11)
    center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin = Side(style="thin", color="D1D5DB")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    # Header
    for col_idx, (header, _) in enumerate(EXPORT_COLUMNS, 1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = center
        cell.border = border

    ws.row_dimensions[1].height = 30

    # Data
    for row_idx, p in enumerate(rows, 2):
        for col_idx, (_, field) in enumerate(EXPORT_COLUMNS, 1):
            if field == "_department_name":
                val = dept_map.get(str(p.department_id), "")
            elif field == "_position_name":
                val = (pos_map or {}).get(str(p.position_id), "")
            elif field == "_job_title_name":
                val = (title_map or {}).get(str(p.job_title_id), "")
            elif field == "_is_active":
                val = "Hoạt động" if p.is_active else "Vô hiệu"
            elif field in ("birthday", "private_code_date", "job_date_join",
                           "job_date_try", "job_reldate_join", "job_date_out"):
                val = _date_str(getattr(p, field, None))
            elif field == "gender":
                raw = getattr(p, field, None) or ""
                val = {"MALE": "Nam", "FEMALE": "Nữ", "OTHER": "Khác"}.get(raw, raw)
            elif field == "job_status":
                raw = getattr(p, field, None) or ""
                val = {"PROBATION": "Thử việc", "OFFICIAL": "Chính thức",
                       "RESIGNED": "Đã nghỉ", "TERMINATED": "Chấm dứt"}.get(raw, raw)
            elif field == "salary_method":
                raw = getattr(p, field, None) or ""
                val = {"FIXED": "Lương cố định", "TIMESHEET": "Theo công",
                       "PIECE": "Khoán sản phẩm"}.get(raw, raw)
            else:
                val = getattr(p, field, None)
                if val is not None:
                    val = str(val) if not isinstance(val, (int, float)) else val
            cell = ws.cell(row=row_idx, column=col_idx, value=val)
            cell.border = border
            cell.alignment = Alignment(vertical="center", wrap_text=False)

    # Column widths
    col_widths = [14,22,10,13,16,13,24,12,10,24,14,14,30,30,20,22,18,14,13,13,13,13,24,16,16,30,14]
    for i, w in enumerate(col_widths, 1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = w

    ws.freeze_panes = "A2"
    return wb


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


@router.get("/export", summary="Xuất danh sách nhân sự ra Excel")
async def export_personnel(
    search: Optional[str] = Query(None),
    department_id: Optional[uuid.UUID] = Query(None),
    job_status: Optional[str] = Query(None),
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
        ))
    if department_id:
        q = q.where(Personnel.department_id == department_id)
    if job_status:
        q = q.where(Personnel.job_status == job_status)
    if is_active is not None:
        q = q.where(Personnel.is_active == is_active)

    rows = (await db.execute(q.order_by(Personnel.full_name))).scalars().all()

    depts = (await db.execute(select(Department))).scalars().all()
    dept_map = {str(d.id): d.name for d in depts}

    positions = (await db.execute(select(Position))).scalars().all()
    pos_map = {str(p.id): p.title for p in positions}

    job_titles = (await db.execute(select(PositionTitle))).scalars().all()
    title_map = {str(t.id): t.title for t in job_titles}

    wb = _build_excel(rows, dept_map, pos_map, title_map)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    from datetime import datetime
    filename = f"nhan_su_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/import-template", summary="Tải file mẫu nhập nhân sự")
async def download_import_template(current_user=Depends(get_current_user)):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Mẫu nhập nhân sự"

    header_fill = PatternFill("solid", fgColor="1A2744")
    header_font = Font(bold=True, color="FFFFFF", size=11)
    thin = Side(style="thin", color="D1D5DB")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    center = Alignment(horizontal="center", vertical="center")

    headers = [h for h, _ in EXPORT_COLUMNS]
    for col_idx, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_idx, value=h)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = center
        cell.border = border

    # Dòng gợi ý
    hints = [
        "NV001", "Nguyễn Văn A", "Nam / Nữ / Khác", "dd/mm/yyyy",
        "012345678901", "dd/mm/yyyy", "Công an TP.HCM", "Việt Nam", "Kinh",
        "nv@email.com", "024...", "09x...", "Địa chỉ thường trú", "Địa chỉ hiện tại",
        "Tên phòng ban", "Tên vị trí (VD: Kỹ sư phần mềm)", "Tên chức danh (VD: Chuyên viên)",
        "Thử việc / Chính thức / Đã nghỉ / Chấm dứt",
        "dd/mm/yyyy", "dd/mm/yyyy", "dd/mm/yyyy", "dd/mm/yyyy", "",
        "Lương cố định / Theo công / Khoán sản phẩm", "10000000", "", "Hoạt động / Vô hiệu",
    ]
    hint_font = Font(color="94A3B8", italic=True, size=10)
    for col_idx, hint in enumerate(hints, 1):
        cell = ws.cell(row=2, column=col_idx, value=hint)
        cell.font = hint_font
        cell.border = border

    col_widths = [14,22,10,13,16,13,24,12,10,24,14,14,30,30,20,24,20,18,13,13,13,13,24,20,16,30,14]
    for i, w in enumerate(col_widths, 1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = w
    ws.row_dimensions[1].height = 28
    ws.freeze_panes = "A3"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=mau_nhap_nhan_su.xlsx"},
    )


@router.post("/import", summary="Nhập nhân sự từ file Excel")
async def import_personnel(
    file: UploadFile = File(...),
    update_existing: bool = Query(False, description="Cập nhật nếu mã NV đã tồn tại"),
    db=Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận file Excel (.xlsx, .xls)")

    content = await file.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    except Exception:
        raise HTTPException(status_code=400, detail="File Excel không hợp lệ")

    ws = wb.active
    headers = [str(ws.cell(1, c).value or "").strip() for c in range(1, ws.max_column + 1)]

    # Map header → column index (0-based)
    col = {h: i for i, h in enumerate(headers)}
    missing = IMPORT_REQUIRED - set(headers)
    if missing:
        raise HTTPException(status_code=400, detail=f"File thiếu cột bắt buộc: {', '.join(missing)}")

    # Load lookup maps: name → id
    depts = (await db.execute(select(Department))).scalars().all()
    dept_name_map = {d.name.strip().lower(): d.id for d in depts}

    positions = (await db.execute(select(Position))).scalars().all()
    pos_name_map = {p.title.strip().lower(): p.id for p in positions}

    job_titles = (await db.execute(select(PositionTitle))).scalars().all()
    title_name_map = {t.title.strip().lower(): t.id for t in job_titles}

    def get(row, name):
        idx = col.get(name)
        if idx is None:
            return None
        v = ws.cell(row, idx + 1).value
        return str(v).strip() if v is not None else None

    def parse_date(s):
        if not s:
            return None
        for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
            try:
                from datetime import datetime as dt
                return dt.strptime(s.strip(), fmt).date()
            except Exception:
                pass
        return None

    created, updated, errors = 0, 0, []

    for row_idx in range(3, ws.max_row + 1):  # row 2 là gợi ý
        emp_code = get(row_idx, "Mã nhân viên")
        full_name = get(row_idx, "Họ và tên")
        if not emp_code and not full_name:
            continue  # dòng trống
        if not emp_code or not full_name:
            errors.append({"row": row_idx, "error": "Thiếu Mã nhân viên hoặc Họ tên"})
            continue

        dept_name = get(row_idx, "Phòng ban (tên)")
        dept_id = dept_name_map.get(dept_name.lower()) if dept_name else None

        pos_name = get(row_idx, "Vị trí công việc (tên)")
        pos_id = pos_name_map.get(pos_name.lower()) if pos_name else None

        title_name = get(row_idx, "Chức danh (tên)")
        title_id = title_name_map.get(title_name.lower()) if title_name else None

        gender_raw = (get(row_idx, "Giới tính") or "").lower()
        job_status_raw = (get(row_idx, "Trạng thái LĐ") or "").lower()
        salary_raw = (get(row_idx, "Hình thức lương") or "").lower()
        is_active_raw = (get(row_idx, "Trạng thái TK") or "hoạt động").lower()

        data = {
            "employee_code":     emp_code,
            "full_name":         full_name,
            "gender":            GENDER_MAP.get(gender_raw),
            "birthday":          parse_date(get(row_idx, "Ngày sinh")),
            "private_code":      get(row_idx, "Số CMND/CCCD"),
            "private_code_date": parse_date(get(row_idx, "Ngày cấp")),
            "private_code_place":get(row_idx, "Nơi cấp"),
            "nationality":       get(row_idx, "Quốc tịch"),
            "ethnicity":         get(row_idx, "Dân tộc"),
            "email":             get(row_idx, "Email"),
            "phone":             get(row_idx, "Điện thoại"),
            "mobile":            get(row_idx, "Di động"),
            "home_address":      get(row_idx, "Địa chỉ thường trú"),
            "current_address":   get(row_idx, "Địa chỉ hiện tại"),
            "department_id":     dept_id,
            "position_id":       pos_id,
            "job_title_id":      title_id,
            "job_status":        STATUS_MAP.get(job_status_raw),
            "job_date_join":     parse_date(get(row_idx, "Ngày vào làm")),
            "job_date_try":      parse_date(get(row_idx, "Ngày thử việc")),
            "job_reldate_join":  parse_date(get(row_idx, "Ngày chính thức")),
            "job_date_out":      parse_date(get(row_idx, "Ngày nghỉ việc")),
            "job_out_reason":    get(row_idx, "Lý do nghỉ"),
            "salary_method":     SALARY_MAP.get(salary_raw),
            "salary_real":       float(get(row_idx, "Mức lương (VNĐ)") or 0) or None,
            "description":       get(row_idx, "Ghi chú"),
            "is_active":         is_active_raw != "vô hiệu",
        }

        existing = (await db.execute(
            select(Personnel).where(Personnel.employee_code == emp_code)
        )).scalar_one_or_none()

        if existing:
            if update_existing:
                for k, v in data.items():
                    if k != "employee_code" and v is not None:
                        setattr(existing, k, v)
                existing.updated_by = current_user.id
                updated += 1
            else:
                errors.append({"row": row_idx, "error": f"Mã NV '{emp_code}' đã tồn tại (bỏ qua)"})
        else:
            p = Personnel(**{k: v for k, v in data.items() if v is not None},
                          employee_code=emp_code, full_name=full_name,
                          created_by=current_user.id)
            db.add(p)
            created += 1

    await db.commit()
    return {"created": created, "updated": updated, "errors": errors, "total_rows": created + updated + len(errors)}


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
