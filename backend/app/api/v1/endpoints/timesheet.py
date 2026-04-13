"""
Timesheet / Bảng chấm công endpoints
"""
from __future__ import annotations
import calendar
import io
import json
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.timesheet import TimesheetRowIn, TimesheetRowOut
from app.core.auth import get_current_user

router = APIRouter()


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def _safe_hours(h) -> dict:
    """Đảm bảo hours là dict hợp lệ."""
    if not h:
        return {}
    if isinstance(h, str):
        try:
            return json.loads(h)
        except Exception:
            return {}
    return dict(h)


# ─────────────────────────────────────────────────────────────
# List rows for a month
# ─────────────────────────────────────────────────────────────

@router.get("", response_model=list[TimesheetRowOut])
async def list_rows(
    year:    int = Query(...),
    month:   int = Query(...),
    dept_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    dept_clause = "AND p.department_id = :dept_id::uuid" if dept_id else ""
    rows = await db.execute(text(f"""
        SELECT tr.*,
               p.full_name, p.employee_code,
               p.position AS position_text,
               d.name     AS department_name
        FROM timesheet_rows tr
        JOIN personnel p ON p.id = tr.personnel_id
        LEFT JOIN departments d ON d.id = p.department_id
        WHERE tr.year = :year AND tr.month = :month {dept_clause}
        ORDER BY p.full_name, tr.row_index
    """), {"year": year, "month": month, **({"dept_id": dept_id} if dept_id else {})})
    result = []
    for r in rows.fetchall():
        row = dict(r._mapping)
        row["hours"] = _safe_hours(row.get("hours"))
        row["leave_days"] = float(row.get("leave_days") or 0)
        result.append(row)
    return result


# ─────────────────────────────────────────────────────────────
# Bulk save (upsert) rows
# ─────────────────────────────────────────────────────────────

@router.post("/rows/bulk")
async def bulk_save(
    rows: list[TimesheetRowIn],
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    saved_ids = []
    for row in rows:
        hours_json = json.dumps({k: float(v) for k, v in row.hours.items() if v not in (None, "", 0)})

        if row.id:
            await db.execute(text("""
                UPDATE timesheet_rows SET
                    row_label        = :row_label,
                    work_description = :work_description,
                    hours            = :hours::jsonb,
                    leave_days       = :leave_days,
                    notes            = :notes,
                    updated_at       = NOW()
                WHERE id = :id
            """), {
                "id": str(row.id), "row_label": row.row_label,
                "work_description": row.work_description,
                "hours": hours_json, "leave_days": row.leave_days,
                "notes": row.notes,
            })
            saved_ids.append(str(row.id))
        else:
            result = await db.execute(text("""
                INSERT INTO timesheet_rows
                    (id, personnel_id, year, month, row_index,
                     row_label, work_description, hours, leave_days, notes)
                VALUES
                    (gen_random_uuid(), :pid, :year, :month, :row_index,
                     :row_label, :work_description, :hours::jsonb, :leave_days, :notes)
                ON CONFLICT (personnel_id, year, month, row_index) DO UPDATE SET
                    row_label        = EXCLUDED.row_label,
                    work_description = EXCLUDED.work_description,
                    hours            = EXCLUDED.hours,
                    leave_days       = EXCLUDED.leave_days,
                    notes            = EXCLUDED.notes,
                    updated_at       = NOW()
                RETURNING id
            """), {
                "pid": str(row.personnel_id), "year": row.year, "month": row.month,
                "row_index": row.row_index, "row_label": row.row_label,
                "work_description": row.work_description,
                "hours": hours_json, "leave_days": row.leave_days, "notes": row.notes,
            })
            saved_ids.append(str(result.scalar()))

    await db.commit()
    return {"ok": True, "ids": saved_ids}


# ─────────────────────────────────────────────────────────────
# Delete a row
# ─────────────────────────────────────────────────────────────

@router.delete("/rows/{row_id}", status_code=204)
async def delete_row(
    row_id: UUID,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    r = await db.execute(
        text("DELETE FROM timesheet_rows WHERE id = :id RETURNING id"),
        {"id": str(row_id)}
    )
    if not r.fetchone():
        raise HTTPException(status_code=404, detail="Không tìm thấy dòng chấm công")
    await db.commit()


# ─────────────────────────────────────────────────────────────
# Export Excel
# ─────────────────────────────────────────────────────────────

@router.get("/export")
async def export_excel(
    year:    int = Query(...),
    month:   int = Query(...),
    dept_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    from openpyxl import Workbook
    from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
    from openpyxl.utils import get_column_letter

    num_days = calendar.monthrange(year, month)[1]

    # Load rows
    dept_clause = "AND p.department_id = :dept_id::uuid" if dept_id else ""
    rows_q = await db.execute(text(f"""
        SELECT tr.*, p.full_name, p.employee_code, p.position AS position_text,
               d.name AS department_name
        FROM timesheet_rows tr
        JOIN personnel p ON p.id = tr.personnel_id
        LEFT JOIN departments d ON d.id = p.department_id
        WHERE tr.year = :year AND tr.month = :month {dept_clause}
        ORDER BY p.full_name, tr.row_index
    """), {"year": year, "month": month, **({"dept_id": dept_id} if dept_id else {})})
    rows = [dict(r._mapping) for r in rows_q.fetchall()]

    # Also include personnel with no rows
    personnel_q = await db.execute(text(f"""
        SELECT p.id, p.full_name, p.employee_code, p.position,
               d.name AS department_name
        FROM personnel p
        LEFT JOIN departments d ON d.id = p.department_id
        WHERE p.is_active = TRUE {dept_clause.replace('p.department_id', 'p.department_id')}
        ORDER BY p.full_name
    """), {**({"dept_id": dept_id} if dept_id else {})})
    all_p = {str(r.id): r for r in personnel_q.fetchall()}
    seen_pids = {str(r["personnel_id"]) for r in rows}
    for pid, p in all_p.items():
        if pid not in seen_pids:
            rows.append({
                "id": None, "personnel_id": p.id, "year": year, "month": month,
                "row_index": 0, "row_label": None, "work_description": None,
                "hours": {}, "leave_days": 0, "notes": None,
                "full_name": p.full_name, "employee_code": p.employee_code,
                "position_text": p.position, "department_name": p.department_name,
            })

    # ── Build Excel ──────────────────────────────────────────
    wb = Workbook()
    ws = wb.active
    ws.title = f"Chấm công T{month:02d}-{year}"

    thin  = Side(style="thin",   color="CCCCCC")
    thick = Side(style="medium", color="1A2744")
    bdr   = Border(left=thin, right=thin, top=thin, bottom=thin)

    header_fill = PatternFill("solid", fgColor="1A2744")
    sub_fill    = PatternFill("solid", fgColor="E8ECF4")
    alt_fill    = PatternFill("solid", fgColor="F8FAFC")
    ot_fill     = PatternFill("solid", fgColor="DCFCE7")

    hf = Font(bold=True, color="FFFFFF", size=9)
    sf = Font(bold=True, size=9)
    df = Font(size=9)

    def hc(r, c, v, fill=header_fill):
        cell = ws.cell(row=r, column=c, value=v)
        cell.font = hf if fill == header_fill else sf
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = bdr
        cell.fill = fill
        return cell

    def dc(r, c, v, fill=None, bold=False, align="center"):
        cell = ws.cell(row=r, column=c, value=v)
        cell.font = Font(bold=bold, size=9)
        cell.alignment = Alignment(horizontal=align, vertical="center")
        cell.border = bdr
        if fill:
            cell.fill = fill
        return cell

    # Title
    total_cols = 4 + num_days + 7  # 4 fixed + days + 7 summary
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=total_cols)
    title = ws.cell(row=1, column=1, value=f"BẢNG CHẤM CÔNG – THÁNG {month:02d}/{year}")
    title.font = Font(bold=True, size=14, color="1A2744")
    title.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 28

    # Header row
    fixed_headers = ["STT", "Họ và tên", "CV/Bộ phận", "Diễn giải công việc"]
    sum_headers   = ["Nghỉ phép", "Tăng ca (giờ)", "Tổng giờ", "Ngày công", "TC>2h", "Ghi chú"]
    # Note: we removed "Số ngày TC>2h" and merged into TC>2h

    for ci, h in enumerate(fixed_headers, start=1):
        hc(2, ci, h)
    for d in range(1, num_days + 1):
        hc(2, 4 + d, str(d))
    for ci, h in enumerate(sum_headers, start=5 + num_days):
        hc(2, ci, h)
    ws.row_dimensions[2].height = 32

    # Column widths
    ws.column_dimensions["A"].width = 5
    ws.column_dimensions["B"].width = 20
    ws.column_dimensions["C"].width = 14
    ws.column_dimensions["D"].width = 18
    for d in range(1, num_days + 1):
        ws.column_dimensions[get_column_letter(4 + d)].width = 3.5
    sum_widths = [8, 10, 8, 8, 6, 14]
    for i, w in enumerate(sum_widths):
        ws.column_dimensions[get_column_letter(5 + num_days + i)].width = w

    ws.freeze_panes = "E3"

    # Data rows
    prev_pid = None
    stt = 0
    data_row = 3

    for row in rows:
        pid  = str(row["personnel_id"])
        hrs  = _safe_hours(row.get("hours"))
        is_first = (pid != prev_pid)
        if is_first:
            stt += 1
            prev_pid = pid

        bg = alt_fill if stt % 2 == 0 else None

        dc(data_row, 1, stt if is_first else "", fill=bg, align="center")
        dc(data_row, 2, row["full_name"] if is_first else "", fill=bg, align="left", bold=is_first)
        dc(data_row, 3, f"{row.get('position_text') or ''} / {row.get('department_name') or ''}".strip("/ ") if is_first else "", fill=bg, align="left")
        dc(data_row, 4, row.get("work_description") or "", fill=bg, align="left")

        total_hours = regular_hours = overtime_hours = work_days = ot_over2h = 0
        for d in range(1, num_days + 1):
            h = float(hrs.get(str(d)) or 0)
            cell_fill = ot_fill if h > 8 else (bg or None)
            dc(data_row, 4 + d, h if h > 0 else "", fill=cell_fill)
            if h > 0:
                work_days += 1
                total_hours   += h
                regular_hours += min(h, 8)
                ot = max(0, h - 8)
                overtime_hours += ot
                if ot > 2:
                    ot_over2h += 1

        leave = float(row.get("leave_days") or 0)
        base = 5 + num_days
        dc(data_row, base,     leave            or "", fill=sub_fill, bold=True)
        dc(data_row, base + 1, round(overtime_hours, 1) or "", fill=sub_fill, bold=True)
        dc(data_row, base + 2, round(total_hours, 1)    or "", fill=sub_fill, bold=True)
        dc(data_row, base + 3, work_days                or "", fill=sub_fill, bold=True)
        dc(data_row, base + 4, ot_over2h                or "", fill=sub_fill, bold=True)
        dc(data_row, base + 5, row.get("notes") or "", fill=bg, align="left")

        ws.row_dimensions[data_row].height = 16
        data_row += 1

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    fname = f"cham_cong_T{month:02d}_{year}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
