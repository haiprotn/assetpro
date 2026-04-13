"""
Timesheet / Chấm công endpoints
"""
from __future__ import annotations
import calendar
import io
from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.timesheet import TimesheetEntryIn, TimesheetEntryOut, PersonnelTimesheetTypeUpdate

router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _fetch_entries(db: AsyncSession, year: int, month: int) -> list[dict]:
    rows = await db.execute(text("""
        SELECT te.*,
               p.full_name, p.employee_code, p.timesheet_type,
               d.name AS department_name
        FROM timesheet_entries te
        JOIN personnel p ON p.id = te.personnel_id
        LEFT JOIN departments d ON d.id = p.department_id
        WHERE EXTRACT(YEAR  FROM te.entry_date) = :year
          AND EXTRACT(MONTH FROM te.entry_date) = :month
        ORDER BY p.full_name, te.entry_date, te.equipment_name NULLS FIRST
    """), {"year": year, "month": month})
    return [dict(r._mapping) for r in rows.fetchall()]


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[TimesheetEntryOut])
async def list_entries(
    year:  int = Query(...),
    month: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    return await _fetch_entries(db, year, month)


@router.post("/entries", response_model=TimesheetEntryOut)
async def upsert_entry(
    body: TimesheetEntryIn,
    db: AsyncSession = Depends(get_db),
):
    """Tạo hoặc cập nhật 1 dòng chấm công (upsert)."""
    if body.equipment_name is None:
        # OFFICE – unique by (personnel_id, entry_date, equipment_name IS NULL)
        conflict_clause = "(personnel_id, entry_date) WHERE equipment_name IS NULL"
    else:
        # OPERATOR – unique by (personnel_id, entry_date, equipment_name)
        conflict_clause = "(personnel_id, entry_date, equipment_name)"

    result = await db.execute(text(f"""
        INSERT INTO timesheet_entries
            (id, personnel_id, entry_date,
             hours_regular, is_leave, overtime_hours, overtime_over_2h, work_days, work_description,
             equipment_name, hours_main, hours_secondary, notes)
        VALUES
            (gen_random_uuid(), :pid, :edate,
             :hrs_reg, :is_leave, :ot_hrs, :ot_2h, :wdays, :wdesc,
             :equip, :hrs_main, :hrs_sec, :notes)
        ON CONFLICT {conflict_clause}
        DO UPDATE SET
            hours_regular    = EXCLUDED.hours_regular,
            is_leave         = EXCLUDED.is_leave,
            overtime_hours   = EXCLUDED.overtime_hours,
            overtime_over_2h = EXCLUDED.overtime_over_2h,
            work_days        = EXCLUDED.work_days,
            work_description = EXCLUDED.work_description,
            hours_main       = EXCLUDED.hours_main,
            hours_secondary  = EXCLUDED.hours_secondary,
            notes            = EXCLUDED.notes,
            updated_at       = NOW()
        RETURNING id
    """), {
        "pid":      str(body.personnel_id),
        "edate":    body.entry_date,
        "hrs_reg":  body.hours_regular,
        "is_leave": body.is_leave,
        "ot_hrs":   body.overtime_hours,
        "ot_2h":    body.overtime_over_2h,
        "wdays":    body.work_days,
        "wdesc":    body.work_description,
        "equip":    body.equipment_name,
        "hrs_main": body.hours_main,
        "hrs_sec":  body.hours_secondary,
        "notes":    body.notes,
    })
    row_id = result.scalar()

    entry_row = await db.execute(text("""
        SELECT te.*, p.full_name, p.employee_code, p.timesheet_type, d.name AS department_name
        FROM timesheet_entries te
        JOIN personnel p ON p.id = te.personnel_id
        LEFT JOIN departments d ON d.id = p.department_id
        WHERE te.id = :id
    """), {"id": str(row_id)})
    entry = entry_row.fetchone()
    if not entry:
        raise HTTPException(status_code=500, detail="Không thể lấy dữ liệu sau khi lưu")

    await db.commit()
    return dict(entry._mapping)


@router.delete("/entries/{entry_id}")
async def delete_entry(entry_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("DELETE FROM timesheet_entries WHERE id = :id RETURNING id"),
        {"id": str(entry_id)}
    )
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Không tìm thấy dòng chấm công")
    await db.commit()
    return {"ok": True}


@router.get("/summary")
async def get_summary(
    year:  int = Query(...),
    month: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Tổng hợp theo nhân viên trong tháng."""
    rows = await db.execute(text("""
        SELECT
            p.id AS personnel_id, p.full_name, p.employee_code,
            p.timesheet_type, d.name AS department_name,
            -- OFFICE summary
            SUM(CASE WHEN te.equipment_name IS NULL THEN te.work_days    ELSE 0 END) AS total_work_days,
            SUM(CASE WHEN te.equipment_name IS NULL THEN te.hours_regular ELSE 0 END) AS total_hours_regular,
            SUM(CASE WHEN te.equipment_name IS NULL THEN te.overtime_hours ELSE 0 END) AS total_overtime,
            SUM(CASE WHEN te.equipment_name IS NULL AND te.is_leave THEN 1 ELSE 0 END) AS total_leave_days,
            -- OPERATOR summary
            SUM(CASE WHEN te.equipment_name IS NOT NULL THEN te.hours_main      ELSE 0 END) AS total_hours_main,
            SUM(CASE WHEN te.equipment_name IS NOT NULL THEN te.hours_secondary  ELSE 0 END) AS total_hours_secondary,
            COUNT(DISTINCT te.id) AS total_entries
        FROM personnel p
        LEFT JOIN departments d ON d.id = p.department_id
        LEFT JOIN timesheet_entries te
            ON te.personnel_id = p.id
            AND EXTRACT(YEAR  FROM te.entry_date) = :year
            AND EXTRACT(MONTH FROM te.entry_date) = :month
        WHERE p.is_active = TRUE
        GROUP BY p.id, p.full_name, p.employee_code, p.timesheet_type, d.name
        ORDER BY p.full_name
    """), {"year": year, "month": month})
    return [dict(r._mapping) for r in rows.fetchall()]


@router.patch("/personnel/{personnel_id}/type")
async def set_personnel_timesheet_type(
    personnel_id: UUID,
    body: PersonnelTimesheetTypeUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Đặt loại chấm công cho nhân viên (OFFICE / OPERATOR)."""
    if body.timesheet_type not in ("OFFICE", "OPERATOR"):
        raise HTTPException(status_code=400, detail="timesheet_type phải là OFFICE hoặc OPERATOR")
    await db.execute(
        text("UPDATE personnel SET timesheet_type = :t WHERE id = :id"),
        {"t": body.timesheet_type, "id": str(personnel_id)}
    )
    await db.commit()
    return {"ok": True}


@router.get("/export")
async def export_excel(
    year:  int = Query(...),
    month: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Xuất file Excel chấm công tháng."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
    from openpyxl.utils import get_column_letter

    entries = await _fetch_entries(db, year, month)
    num_days = calendar.monthrange(year, month)[1]

    # Tách 2 nhóm
    office_pids: dict[str, dict] = {}
    operator_rows: dict[tuple, dict] = {}  # (pid, equip) → info
    entry_map: dict[tuple, dict] = {}  # (pid, day[int], equip or None) → entry

    for e in entries:
        pid = str(e["personnel_id"])
        d = e["entry_date"].day
        equip = e["equipment_name"]
        entry_map[(pid, d, equip)] = e

        if equip is None:
            if pid not in office_pids:
                office_pids[pid] = e
        else:
            key = (pid, equip)
            if key not in operator_rows:
                operator_rows[key] = e

    wb = Workbook()

    thin = Side(style="thin", color="CCCCCC")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    header_fill = PatternFill("solid", fgColor="1A2744")
    header_font = Font(bold=True, color="FFFFFF", size=10)
    sub_fill    = PatternFill("solid", fgColor="E8ECF4")
    leave_fill  = PatternFill("solid", fgColor="FEF3C7")
    ot_fill     = PatternFill("solid", fgColor="DCFCE7")

    def hcell(ws, row, col, val, fill=None):
        c = ws.cell(row=row, column=col, value=val)
        c.font = header_font if fill == header_fill else Font(bold=True, size=10)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = border
        if fill:
            c.fill = fill
        return c

    def dcell(ws, row, col, val, fill=None):
        c = ws.cell(row=row, column=col, value=val)
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = border
        if fill:
            c.fill = fill
        return c

    # ── Sheet 1: Khối nhân sự chính ──────────────────────────
    ws1 = wb.active
    ws1.title = f"Nhân sự - T{month:02d}/{year}"
    ws1.freeze_panes = "D2"

    FIXED_COLS = ["STT", "Họ và tên", "Bộ phận"]
    DAY_LABELS = [str(d) for d in range(1, num_days + 1)]
    TOTAL_COLS = ["Ngày công", "Giờ thường", "Tăng ca", "Nghỉ phép", "TC>2h"]

    # Header row 1: title
    ws1.merge_cells(start_row=1, start_column=1, end_row=1, end_column=3 + num_days + len(TOTAL_COLS))
    title_cell = ws1.cell(row=1, column=1, value=f"BẢNG CHẤM CÔNG – THÁNG {month:02d}/{year}  |  KHỐI NHÂN SỰ CHÍNH")
    title_cell.font = Font(bold=True, size=13, color="1A2744")
    title_cell.alignment = Alignment(horizontal="center", vertical="center")
    ws1.row_dimensions[1].height = 24

    # Header row 2: columns
    for ci, lbl in enumerate(FIXED_COLS + DAY_LABELS + TOTAL_COLS, start=1):
        hcell(ws1, 2, ci, lbl, fill=header_fill)
    ws1.row_dimensions[2].height = 30

    # Set column widths
    ws1.column_dimensions["A"].width = 5
    ws1.column_dimensions["B"].width = 22
    ws1.column_dimensions["C"].width = 14
    for ci in range(4, 4 + num_days):
        ws1.column_dimensions[get_column_letter(ci)].width = 4
    for ci in range(4 + num_days, 4 + num_days + len(TOTAL_COLS)):
        ws1.column_dimensions[get_column_letter(ci)].width = 10

    # Data rows
    sorted_office = sorted(office_pids.values(), key=lambda x: x["full_name"] or "")

    # Also add people with no entries but timesheet_type=OFFICE
    all_personnel = await db.execute(text("""
        SELECT id, full_name, employee_code, timesheet_type, department_id,
               (SELECT name FROM departments WHERE id = personnel.department_id) dept_name
        FROM personnel WHERE is_active = TRUE ORDER BY full_name
    """))
    all_p = {str(r.id): r for r in all_personnel.fetchall()}

    office_shown = set(office_pids.keys())
    for pid, p in all_p.items():
        if (p.timesheet_type == 'OFFICE' or p.timesheet_type is None) and pid not in office_shown:
            office_shown.add(pid)
            sorted_office.append({
                "personnel_id": p.id, "full_name": p.full_name,
                "employee_code": p.employee_code, "department_name": p.dept_name
            })
    sorted_office.sort(key=lambda x: x.get("full_name") or "")

    for stt, info in enumerate(sorted_office, start=1):
        pid = str(info["personnel_id"])
        row = stt + 2
        dcell(ws1, row, 1, stt)
        ws1.cell(row=row, column=2, value=info.get("full_name", "")).border = border
        ws1.cell(row=row, column=3, value=info.get("department_name", "")).border = border

        total_days = total_hrs = total_ot = total_leave = total_ot2h = 0

        for d in range(1, num_days + 1):
            e = entry_map.get((pid, d, None))
            col = 3 + d
            if e:
                if e["is_leave"]:
                    dcell(ws1, row, col, "NP", fill=leave_fill)
                    total_leave += 1
                else:
                    hrs = float(e["hours_regular"] or 0)
                    ot  = float(e["overtime_hours"] or 0)
                    val = f"{int(hrs)}" if ot == 0 else f"{int(hrs)}+{ot:.0f}"
                    dcell(ws1, row, col, val, fill=ot_fill if ot > 0 else None)
                    total_days += float(e["work_days"] or 0)
                    total_hrs  += hrs
                    total_ot   += ot
                    if e["overtime_over_2h"]:
                        total_ot2h += 1
            else:
                dcell(ws1, row, col, "")

        base_col = 4 + num_days
        for ci, val in enumerate([
            round(total_days, 1), round(total_hrs, 1),
            round(total_ot, 1), total_leave,
            total_ot2h if total_ot2h else ""
        ]):
            hcell(ws1, row, base_col + ci, val if val != 0 else "", fill=sub_fill)

    # ── Sheet 2: Khối vận hành ────────────────────────────────
    ws2 = wb.create_sheet(title=f"Vận hành - T{month:02d}/{year}")
    ws2.freeze_panes = "E2"

    OP_FIXED = ["STT", "Họ và tên", "Thiết bị", "Loại"]
    OP_TOTAL = ["Tổng chính", "Tổng phụ", "Tổng cộng"]

    ws2.merge_cells(start_row=1, start_column=1, end_row=1, end_column=4 + num_days + len(OP_TOTAL))
    t2 = ws2.cell(row=1, column=1, value=f"BẢNG CHẤM CÔNG – THÁNG {month:02d}/{year}  |  KHỐI VẬN HÀNH / LÁI XE")
    t2.font = Font(bold=True, size=13, color="1A2744")
    t2.alignment = Alignment(horizontal="center", vertical="center")
    ws2.row_dimensions[1].height = 24

    for ci, lbl in enumerate(OP_FIXED + DAY_LABELS + OP_TOTAL, start=1):
        hcell(ws2, 2, ci, lbl, fill=header_fill)
    ws2.row_dimensions[2].height = 30

    ws2.column_dimensions["A"].width = 5
    ws2.column_dimensions["B"].width = 22
    ws2.column_dimensions["C"].width = 18
    ws2.column_dimensions["D"].width = 10
    for ci in range(5, 5 + num_days):
        ws2.column_dimensions[get_column_letter(ci)].width = 4
    for ci in range(5 + num_days, 5 + num_days + len(OP_TOTAL)):
        ws2.column_dimensions[get_column_letter(ci)].width = 11

    # Collect operator rows (also include from personnel with OPERATOR type)
    op_rows = []
    seen_op = set()
    for (pid, equip), info in sorted(operator_rows.items(), key=lambda x: (x[1].get("full_name") or "", x[0][1])):
        op_rows.append((pid, equip, info))
        seen_op.add(pid)

    # Operators with no entries this month
    for pid, p in all_p.items():
        if p.timesheet_type == 'OPERATOR' and pid not in seen_op:
            op_rows.append((pid, "", {
                "full_name": p.full_name, "employee_code": p.employee_code, "department_name": ""
            }))

    stt = 0
    prev_pid = None
    for pid, equip, info in op_rows:
        stt += 1
        row = stt * 2 + 1  # 2 rows per entry (chính + phụ)

        # Main work row
        ws2.cell(row=row, column=2, value=info.get("full_name", "")).border = border
        ws2.cell(row=row, column=3, value=equip).border = border
        dcell(ws2, row, 4, "Chính")
        dcell(ws2, row + 1, 1, "")
        ws2.cell(row=row + 1, column=2, value="").border = border
        ws2.cell(row=row + 1, column=3, value="").border = border
        dcell(ws2, row + 1, 4, "Phụ")

        if prev_pid != pid:
            dcell(ws2, row, 1, stt)
        prev_pid = pid

        total_main = total_sec = 0
        for d in range(1, num_days + 1):
            e = entry_map.get((pid, d, equip if equip else None))
            col = 4 + d
            if e:
                m = float(e["hours_main"] or 0)
                s = float(e["hours_secondary"] or 0)
                dcell(ws2, row,     col, m if m else "")
                dcell(ws2, row + 1, col, s if s else "")
                total_main += m
                total_sec  += s
            else:
                dcell(ws2, row,     col, "")
                dcell(ws2, row + 1, col, "")

        base_col = 5 + num_days
        hcell(ws2, row,     base_col,     round(total_main, 1) or "", fill=sub_fill)
        hcell(ws2, row,     base_col + 1, round(total_sec,  1) or "", fill=sub_fill)
        hcell(ws2, row,     base_col + 2, round(total_main + total_sec, 1) or "", fill=sub_fill)
        for ci in range(3):
            dcell(ws2, row + 1, base_col + ci, "")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    filename = f"cham_cong_T{month:02d}_{year}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
