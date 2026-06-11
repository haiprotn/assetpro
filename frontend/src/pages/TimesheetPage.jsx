/**
 * TimesheetPage v5 — Theo mẫu bảng chấm công công trường (Excel)
 *
 * - Ô nhập: số giờ (8, 8.5...) hoặc mã ký hiệu (CP, NP, CV, CCT, NT, NV, OL, N, CT...)
 * - Nhân sự thường: 1 dòng / người
 * - Nhân sự lái máy: 3 dòng / người — TỔNG (tự tính) + Lái máy + Việc khác
 * - Cột tổng hợp: Nghỉ có phép · Tăng ca (giờ) · Ngày TC>2h · Công <8h / 8h / >8h · Tổng ngày công
 */
import { Fragment, useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { timesheetApi, personnelApi, deptApi } from '../services/api'
import { useAuthStore } from '../store/authStore'

const today = new Date()
const DOW_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

function daysInMonth(y, m) { return new Date(y, m, 0).getDate() }

// ─── Mã ký hiệu chấm công (giống chú thích bảng Excel) ───────────────────────
const CODES = {
  CP:  { label: 'Nghỉ có phép',     color: '#b45309', bg: '#fef3c7' },
  NP:  { label: 'Nghỉ không phép',  color: '#dc2626', bg: '#fee2e2' },
  CV:  { label: 'Chờ việc',         color: '#7c3aed', bg: '#ede9fe' },
  CCT: { label: 'Chuyển công trình', color: '#4338ca', bg: '#e0e7ff' },
  NT:  { label: 'Nghỉ tết',         color: '#be123c', bg: '#ffe4e6' },
  NV:  { label: 'Nghỉ việc',        color: '#475569', bg: '#e2e8f0' },
  OL:  { label: 'Nghỉ ốm',          color: '#0e7490', bg: '#cffafe' },
  N:   { label: 'Nghỉ',             color: '#64748b', bg: '#f1f5f9' },
  CT:  { label: 'Công tác',         color: '#1d4ed8', bg: '#dbeafe' },
}

function numVal(v) {
  if (typeof v === 'number') return v
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}
function isCodeVal(v) {
  return typeof v === 'string' && v.trim() !== '' && numVal(v) === 0
}
function parseCellInput(s) {
  const t = String(s ?? '').trim()
  if (!t) return undefined
  if (/^[\d.,]+$/.test(t)) {
    const n = numVal(t)
    return (n > 0 && n <= 24) ? n : undefined
  }
  return t.toUpperCase().slice(0, 8)
}
function codeStyle(code) {
  const c = CODES[String(code).toUpperCase()]
  return c || { label: code, color: '#475569', bg: '#f1f5f9' }
}

// Cột cố định (sticky left)
const FCOLS = [
  { key: 'stt',   label: 'STT',            w: 40,  left: 0   },
  { key: 'name',  label: 'Họ và tên',      w: 165, left: 40  },
  { key: 'spec',  label: 'Chuyên môn/Máy', w: 112, left: 205 },
  { key: 'sdt',   label: 'SĐT',            w: 88,  left: 317 },
  { key: 'line',  label: 'Dòng',           w: 64,  left: 405 },
]
const FIXED_W = 469
const DAY_W   = 34
const SUM_COLS = [
  { key: 'leave',     label: 'Nghỉ\nphép',  color: '#92400e', bg: '#fffbeb' },
  { key: 'otH',       label: 'TC\n(giờ)',   color: '#d97706', bg: '#eef2ff' },
  { key: 'otDays',    label: 'Ngày\nTC>2h', color: '#d97706', bg: '#eef2ff' },
  { key: 'lt8',       label: 'Công\n<8h',   color: '#2563eb', bg: '#eef2ff' },
  { key: 'eq8',       label: 'Công\n8h',    color: '#1e293b', bg: '#eef2ff' },
  { key: 'gt8',       label: 'Công\n>8h',   color: '#16a34a', bg: '#eef2ff' },
  { key: 'totalDays', label: 'Tổng\ncông',  color: '#4338ca', bg: '#e0e7ff' },
]

// ─── Main ────────────────────────────────────────────────────────────────────

export default function TimesheetPage() {
  const qc = useQueryClient()
  const { hasPermission, getAttendanceDepts } = useAuthStore()

  const canWrite  = hasPermission('Chấm công', 'nhập liệu')
  const canExport = hasPermission('Chấm công', 'xuất file')
  const allowedDepts = getAttendanceDepts()
  const deptLocked   = allowedDepts !== null && allowedDepts.length === 1

  const [year,   setYear]   = useState(today.getFullYear())
  const [month,  setMonth]  = useState(today.getMonth() + 1)
  const [deptId, setDeptId] = useState(deptLocked ? allowedDepts[0] : '')
  const [search, setSearch] = useState('')
  const [tab,    setTab]    = useState('input')

  const [saving,     setSaving]     = useState(false)
  const [saveStatus, setSaveStatus] = useState('idle')
  const [dirty,      setDirty]      = useState(false)
  const [toast,      setToast]      = useState(null)

  // Chế độ lái máy bật/tắt tay theo nhân viên (override dữ liệu DB)
  const [machineOn, setMachineOn] = useState({})

  // Ô đang chọn / đang chỉnh sửa — li = index trong editLines
  const [selCell,  setSelCell]  = useState(null) // {li, day}
  const [editCell, setEditCell] = useState(null) // {li, day}
  const [editVal,  setEditVal]  = useState('')

  const containerRef = useRef(null)
  const pendingRef   = useRef({})
  const [drafts, setDrafts] = useState({})

  const numDays = daysInMonth(year, month)
  const days    = Array.from({ length: numDays }, (_, i) => i + 1)

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['timesheet', year, month, deptId],
    queryFn:  () => timesheetApi.list({ year, month, ...(deptId ? { dept_id: deptId } : {}) })
                      .then(r => r.data),
  })

  const { data: allPersonnel = [] } = useQuery({
    queryKey: ['personnel-all'],
    queryFn:  () => personnelApi.getAll().then(r => r.data),
  })

  const { data: depts = [] } = useQuery({
    queryKey: ['departments'],
    queryFn:  () => deptApi.list().then(r => r.data),
  })

  const deptMap = Object.fromEntries(depts.map(d => [String(d.id), d]))

  const filteredP = allPersonnel
    .map(p => ({
      ...p,
      department_name: deptMap[String(p.department_id)]?.name || p.department_name || '',
    }))
    .filter(p => {
      if (p.is_active === false) return false
      if (deptId && String(p.department_id) !== deptId) return false
      if (search) {
        const s = search.toLowerCase()
        if (!p.full_name?.toLowerCase().includes(s) &&
            !p.employee_code?.toLowerCase().includes(s)) return false
      }
      return true
    })

  // DB rows grouped by pid
  const byPid = {}
  for (const r of rows) {
    const pid = String(r.personnel_id)
    ;(byPid[pid] = byPid[pid] || []).push(r)
  }

  // ── Reset khi đổi tháng/phòng ban ────────────────────────────────────────

  useEffect(() => {
    setDrafts({})
    pendingRef.current = {}
    setDirty(false)
    setSelCell(null)
    setEditCell(null)
    setMachineOn({})
  }, [year, month, deptId])

  // ── Ctrl+S để lưu ────────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        flushSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line

  // ── Mutations ─────────────────────────────────────────────────────────────

  const saveMut = useMutation({
    mutationFn: payload => timesheetApi.bulkSave(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timesheet', year, month, deptId] })
      setDirty(false)
      setSaveStatus('saved')
      showToast('✓ Đã lưu thành công!')
      setTimeout(() => setSaveStatus('idle'), 2500)
    },
    onError: err => {
      setSaveStatus('idle')
      showToast('❌ ' + (err?.response?.data?.detail || err.message))
    },
  })

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function flushSave() {
    const batch = pendingRef.current
    if (!Object.keys(batch).length) { showToast('Không có thay đổi để lưu'); return }

    const payload = Object.values(batch).map(row => ({
      id:               row.id || null,
      personnel_id:     String(row.personnel_id),
      year:             Number(row.year),
      month:            Number(row.month),
      row_index:        Number(row.row_index),
      row_label:        row.row_label || null,
      work_description: row.work_description || null,
      hours: Object.fromEntries(
        Object.entries(row.hours || {})
          .map(([k, v]) => {
            if (isCodeVal(v)) return [k, String(v).toUpperCase()]
            const n = numVal(v)
            return n > 0 ? [k, n] : null
          })
          .filter(Boolean)
      ),
      leave_days: Number(row.leave_days) || 0,
      notes:      row.notes || null,
    }))

    pendingRef.current = {}
    setSaving(true); setSaveStatus('saving')
    try   { await saveMut.mutateAsync(payload) }
    catch { pendingRef.current = batch; setDirty(true) }
    finally { setSaving(false) }
  }

  // ── Helpers dữ liệu ───────────────────────────────────────────────────────

  function getRow(pid, idx) {
    return drafts[`${pid}:${idx}`] ||
           (byPid[pid] || []).find(r => r.row_index === idx) ||
           null
  }

  function hasSubRows(pid) {
    const r1 = getRow(pid, 1), r2 = getRow(pid, 2)
    return !!(r1 || r2)
  }

  function isMachine(pid) {
    return machineOn[pid] !== undefined ? machineOn[pid] : hasSubRows(pid)
  }

  function inputIdxs(pid) { return isMachine(pid) ? [1, 2] : [0] }

  function rawCell(pid, idx, day) {
    return (getRow(pid, idx)?.hours || {})[String(day)]
  }

  // Tổng giờ (chỉ số) của 1 ngày trên các dòng nhập liệu
  function dayTotal(pid, day) {
    let t = 0
    for (const idx of inputIdxs(pid)) {
      const v = rawCell(pid, idx, day)
      if (!isCodeVal(v)) t += numVal(v)
    }
    return +t.toFixed(1)
  }

  // Mã ký hiệu đầu tiên của 1 ngày (khi không có giờ)
  function dayCode(pid, day) {
    for (const idx of inputIdxs(pid)) {
      const v = rawCell(pid, idx, day)
      if (isCodeVal(v)) return String(v).toUpperCase()
    }
    return null
  }

  function patchRow(pid, idx, patch) {
    const dbRow = (byPid[pid] || []).find(r => r.row_index === idx)
    const base  = drafts[`${pid}:${idx}`] || dbRow || {
      id: null, personnel_id: pid, year, month, row_index: idx,
      row_label: idx === 1 ? 'Lái máy' : idx === 2 ? 'Việc khác' : null,
      work_description: null, hours: {}, leave_days: 0, notes: null,
    }
    const draft = { ...base, ...patch }
    const key   = `${pid}:${idx}`
    setDrafts(prev => ({ ...prev, [key]: draft }))
    pendingRef.current = { ...pendingRef.current, [key]: draft }
    setDirty(true)
  }

  function patchCell(pid, idx, day, raw) {
    const hours = { ...(getRow(pid, idx)?.hours || {}) }
    const val = parseCellInput(raw)
    if (val === undefined) delete hours[String(day)]
    else hours[String(day)] = val
    patchRow(pid, idx, { hours })
  }

  // ── Bật / tắt chế độ lái máy ─────────────────────────────────────────────

  function enableMachine(pid) {
    const r0 = getRow(pid, 0)
    const r0Hours = { ...(r0?.hours || {}) }
    patchRow(pid, 1, { hours: r0Hours, row_label: getRow(pid, 1)?.row_label || 'Lái máy' })
    patchRow(pid, 2, {})
    if (r0 && Object.keys(r0Hours).length) patchRow(pid, 0, { hours: {} })
    setMachineOn(m => ({ ...m, [pid]: true }))
  }

  async function disableMachine(pid) {
    if (!window.confirm('Gộp dữ liệu "Lái máy" + "Việc khác" về 1 dòng và tắt chế độ lái máy?')) return
    const merged = {}
    for (const idx of [1, 2]) {
      const hrs = getRow(pid, idx)?.hours || {}
      for (const [d, v] of Object.entries(hrs)) {
        if (isCodeVal(v)) { if (merged[d] === undefined) merged[d] = String(v).toUpperCase() }
        else merged[d] = (typeof merged[d] === 'number' ? merged[d] : 0) + numVal(v)
      }
    }
    patchRow(pid, 0, { hours: merged })
    for (const idx of [1, 2]) {
      const dbRow = (byPid[pid] || []).find(r => r.row_index === idx)
      if (dbRow?.id) { try { await timesheetApi.deleteRow(dbRow.id) } catch { /* đã xoá */ } }
      const key = `${pid}:${idx}`
      setDrafts(prev => { const n = { ...prev }; delete n[key]; return n })
      delete pendingRef.current[key]
    }
    setMachineOn(m => ({ ...m, [pid]: false }))
    qc.invalidateQueries({ queryKey: ['timesheet', year, month, deptId] })
  }

  function editMachineLabel(pid) {
    if (!canWrite) return
    const cur = getRow(pid, 1)?.row_label || 'Lái máy'
    const v = window.prompt('Tên máy / chuyên môn (VD: Xe cuốc Ex 350 - ZAXIS):', cur)
    if (v !== null && v.trim()) patchRow(pid, 1, { row_label: v.trim() })
  }

  // ── Tổng hợp tháng / nhân viên (giống cột tổng hợp file Excel) ──────────

  function personSummary(pid) {
    let leave = 0, otH = 0, otDays = 0, lt8 = 0, eq8 = 0, gt8 = 0
    for (let d = 1; d <= numDays; d++) {
      const total = dayTotal(pid, d)
      if (total > 0) {
        if (total < 8) lt8++
        else if (total === 8) eq8++
        else gt8++
        const ot = Math.max(0, total - 8)
        otH += ot
        if (ot > 2) otDays++
      } else if (dayCode(pid, d) === 'CP') {
        leave++
      }
    }
    return { leave, otH: +otH.toFixed(1), otDays, lt8, eq8, gt8, totalDays: lt8 + eq8 + gt8 }
  }

  // ── Danh sách dòng nhập liệu (cho điều hướng phím) ───────────────────────

  const editLines   = []
  const lineIndexOf = {}
  for (const p of filteredP) {
    const pid = String(p.id)
    for (const idx of inputIdxs(pid)) {
      lineIndexOf[`${pid}:${idx}`] = editLines.length
      editLines.push({ pid, idx })
    }
  }

  // ── Chỉnh sửa ô ──────────────────────────────────────────────────────────

  function startEdit(li, day, initialVal) {
    if (!canWrite) return
    const line = editLines[li]
    if (!line) return
    const cur = rawCell(line.pid, line.idx, day)
    setSelCell({ li, day })
    setEditCell({ li, day })
    setEditVal(initialVal !== undefined ? initialVal : (cur !== undefined && cur !== null ? String(cur) : ''))
  }

  function commitEdit(li, day, val) {
    const line = editLines[li]
    if (line) patchCell(line.pid, line.idx, day, val)
    setEditCell(null)
    setEditVal('')
  }

  // ── Điều hướng phím ──────────────────────────────────────────────────────

  function handleGridKeyDown(e) {
    if (editCell) return
    if (!selCell) return
    const { li, day } = selCell
    const n = editLines.length

    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); setSelCell({ li, day: Math.min(day + 1, numDays) }); break
      case 'ArrowLeft':  e.preventDefault(); setSelCell({ li, day: Math.max(day - 1, 1) });       break
      case 'ArrowDown':  e.preventDefault(); setSelCell({ li: Math.min(li + 1, n - 1), day });    break
      case 'ArrowUp':    e.preventDefault(); setSelCell({ li: Math.max(li - 1, 0), day });        break
      case 'Tab':
        e.preventDefault()
        if (e.shiftKey) setSelCell({ li, day: Math.max(day - 1, 1) })
        else            setSelCell({ li, day: Math.min(day + 1, numDays) })
        break
      case 'Enter': case 'F2':
        e.preventDefault()
        startEdit(li, day)
        break
      case 'Delete': case 'Backspace':
        e.preventDefault()
        { const line = editLines[li]; if (line) patchCell(line.pid, line.idx, day, '') }
        break
      default:
        if (/^[0-9a-zA-Z.]$/.test(e.key)) startEdit(li, day, e.key)
    }
  }

  // ── Check đủ ngày thường (8h các ngày T2-T7... trừ CN) ──────────────────

  function fillAllWeekdays() {
    let count = 0
    for (const p of filteredP) {
      const pid = String(p.id)
      if (isMachine(pid)) continue // lái máy phải nhập tay từng dòng
      const hours = { ...(getRow(pid, 0)?.hours || {}) }
      for (let d = 1; d <= numDays; d++) {
        const dow = new Date(year, month - 1, d).getDay()
        if (dow !== 0 && dow !== 6 && hours[String(d)] === undefined) hours[String(d)] = 8
      }
      patchRow(pid, 0, { hours })
      count++
    }
    showToast(`⚡ Đã check ${count} nhân viên (bỏ qua nhân sự lái máy)`)
  }

  // ── Export ────────────────────────────────────────────────────────────────

  async function handleExport() {
    const res = await timesheetApi.export({ year, month, ...(deptId ? { dept_id: deptId } : {}) })
    const url = URL.createObjectURL(new Blob([res.data]))
    const a   = document.createElement('a')
    a.href = url
    a.download = `cham_cong_T${String(month).padStart(2, '0')}_${year}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  // Ô nhập liệu (1 dòng × 1 ngày)
  function renderEditableCell(pid, idx, day, rowBg) {
    const li     = lineIndexOf[`${pid}:${idx}`]
    const v      = rawCell(pid, idx, day)
    const isCode = isCodeVal(v)
    const h      = isCode ? 0 : numVal(v)
    const dow    = new Date(year, month - 1, day).getDay()
    const isWknd = dow === 0 || dow === 6
    const isSel  = selCell?.li === li && selCell?.day === day
    const isEdit = editCell?.li === li && editCell?.day === day
    const isOt   = h > 8

    let cellBg = isWknd ? '#fef9ee' : rowBg
    let color  = '#1e293b'
    if (isCode) {
      const cs = codeStyle(v)
      cellBg = cs.bg; color = cs.color
    } else if (h > 0) {
      cellBg = isOt ? '#dcfce7' : h < 8 ? '#eff6ff' : isWknd ? '#fef3c7' : '#f0fdf4'
      color  = isOt ? '#16a34a' : h < 8 ? '#2563eb' : isWknd ? '#b45309' : '#1e293b'
    }
    if (isSel && !isEdit) cellBg = '#dbeafe'

    return (
      <td
        key={day}
        onClick={() => startEdit(li, day)}
        style={{
          ...TD, width: DAY_W, padding: 0, textAlign: 'center',
          background: cellBg,
          outline: isSel ? '2px solid #2563eb' : 'none',
          outlineOffset: '-1px',
          cursor: canWrite ? 'cell' : 'default',
        }}
      >
        {isEdit ? (
          <input
            autoFocus
            type="text"
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={() => commitEdit(li, day, editVal)}
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === 'Escape') { setEditCell(null); setEditVal(''); return }
              if (e.key === 'Enter') {
                commitEdit(li, day, editVal)
                startEdit(Math.min(li + 1, editLines.length - 1), day)
                return
              }
              if (e.key === 'Tab') {
                e.preventDefault()
                commitEdit(li, day, editVal)
                startEdit(li, e.shiftKey ? Math.max(day - 1, 1) : Math.min(day + 1, numDays))
                return
              }
              if (e.key === 'ArrowDown') { commitEdit(li, day, editVal); startEdit(Math.min(li + 1, editLines.length - 1), day); return }
              if (e.key === 'ArrowUp')   { commitEdit(li, day, editVal); startEdit(Math.max(li - 1, 0), day); return }
            }}
            style={{
              width: '100%', height: 26, border: 'none',
              background: 'white', textAlign: 'center',
              fontSize: 12, fontWeight: 700, outline: 'none', padding: 0,
              textTransform: 'uppercase',
            }}
          />
        ) : (
          <div style={{
            height: 26, lineHeight: '26px',
            fontSize: isCode ? 9.5 : 12,
            fontWeight: (h > 0 || isCode) ? 700 : 300,
            color: (h > 0 || isCode) ? color : isWknd ? '#fbbf24' : '#e5e7eb',
            overflow: 'hidden',
          }}>
            {isCode ? String(v).toUpperCase() : h > 0 ? h : isWknd ? '—' : ''}
          </div>
        )}
      </td>
    )
  }

  // Ô dòng TỔNG (tự tính, không sửa được)
  function renderTongCell(pid, day) {
    const total = dayTotal(pid, day)
    const code  = total > 0 ? null : dayCode(pid, day)
    const cs    = code ? codeStyle(code) : null
    return (
      <td key={day} style={{
        ...TD, width: DAY_W, padding: 0, textAlign: 'center',
        background: code ? cs.bg : total > 8 ? '#dcfce7' : '#f1f5f9',
      }}>
        <div style={{
          height: 26, lineHeight: '26px',
          fontSize: code ? 9.5 : 12, fontWeight: 700,
          color: code ? cs.color : total > 8 ? '#16a34a' : total > 0 ? '#1a2744' : '#cbd5e1',
        }}>
          {code || (total > 0 ? total : '')}
        </div>
      </td>
    )
  }

  // Cột tổng hợp bên phải
  function renderSummaryCells(summ) {
    return SUM_COLS.map(c => (
      <td key={c.key} style={{
        ...TD, textAlign: 'center', fontWeight: 700, fontSize: 12.5,
        background: c.bg, color: summ[c.key] > 0 ? c.color : '#cbd5e1',
        borderLeft: c.key === 'leave' ? '2px solid #c7d2fe' : undefined,
      }}>
        {summ[c.key] > 0 ? summ[c.key] : ''}
      </td>
    ))
  }

  function renderEmptySummaryCells() {
    return SUM_COLS.map(c => (
      <td key={c.key} style={{
        ...TD, background: c.bg,
        borderLeft: c.key === 'leave' ? '2px solid #c7d2fe' : undefined,
        borderTop: 'none',
      }} />
    ))
  }

  // Cột thông tin sticky bên trái
  function stickyInfoCells(p, pi, rowBg, isFirst, isLast, machine) {
    const pid = String(p.id)
    const machineLabel = machine ? (getRow(pid, 1)?.row_label || 'Lái máy') : null
    const groupBorder = { borderBottom: isLast ? '1px solid #e2e8f0' : 'none' }

    return (
      <>
        <td style={{
          ...TD, ...groupBorder, position: 'sticky', left: 0, background: rowBg, zIndex: 2,
          textAlign: 'center', fontWeight: 600, color: '#94a3b8', fontSize: 11,
        }}>
          {isFirst ? pi + 1 : ''}
        </td>
        <td style={{ ...TD, ...groupBorder, position: 'sticky', left: 40, background: rowBg, zIndex: 2, paddingLeft: 8 }}>
          {isFirst && (
            <>
              <div style={{
                fontSize: 12.5, fontWeight: 700, color: '#1e293b',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 152,
              }}>
                {p.full_name}
              </div>
              <div style={{
                fontSize: 9.5, color: '#94a3b8',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 152,
              }}>
                {[p.position, p.department_name].filter(Boolean).join(' · ') || '—'}
              </div>
            </>
          )}
        </td>
        <td style={{
          ...TD, ...groupBorder, position: 'sticky', left: 205, background: rowBg, zIndex: 2,
          fontSize: 10, color: '#475569', paddingLeft: 6,
        }}>
          {isFirst && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                onClick={() => machine && editMachineLabel(pid)}
                title={machine ? 'Click để sửa tên máy' : ''}
                style={{
                  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  cursor: machine && canWrite ? 'pointer' : 'default',
                  fontWeight: machine ? 700 : 400,
                  color: machine ? '#1d4ed8' : '#64748b',
                  textDecoration: machine && canWrite ? 'underline dotted' : 'none',
                }}
              >
                {machine ? machineLabel : 'Chuyên môn'}
              </span>
              {canWrite && (
                <button
                  onClick={() => machine ? disableMachine(pid) : enableMachine(pid)}
                  title={machine ? 'Tắt chế độ lái máy (gộp về 1 dòng)' : 'Bật chế độ lái máy (3 dòng: Tổng / Lái máy / Việc khác)'}
                  style={{
                    border: 'none', borderRadius: 5, cursor: 'pointer', flexShrink: 0,
                    fontSize: 10, padding: '1px 5px', lineHeight: '14px',
                    background: machine ? '#fee2e2' : '#f1f5f9',
                    color: machine ? '#dc2626' : '#64748b',
                  }}
                >
                  {machine ? '✕' : '🚜'}
                </button>
              )}
            </div>
          )}
        </td>
        <td style={{
          ...TD, ...groupBorder, position: 'sticky', left: 317, background: rowBg, zIndex: 2,
          textAlign: 'center', fontSize: 10.5, color: '#64748b', whiteSpace: 'nowrap',
        }}>
          {isFirst ? (p.mobile || p.phone || '—') : ''}
        </td>
      </>
    )
  }

  function lineLabelCell(label, bold, color, isLast) {
    return (
      <td style={{
        ...TD, position: 'sticky', left: 405, zIndex: 2,
        background: bold ? '#e8ecf4' : '#f8fafc',
        borderBottom: isLast ? '1px solid #e2e8f0' : '1px solid #eef0f3',
        borderRight: '2px solid #cbd5e1',
        fontSize: 9.5, fontWeight: bold ? 800 : 600, color, textAlign: 'center',
        whiteSpace: 'nowrap',
      }}>
        {label}
      </td>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f1f5f9' }}>

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', flexWrap: 'wrap',
        background: 'white', borderBottom: '1px solid #e2e8f0', flexShrink: 0,
      }}>
        <span style={{ fontWeight: 800, fontSize: 17, color: '#1a2744' }}>🗓️ Chấm công</span>

        <select style={SEL} value={month} onChange={e => setMonth(+e.target.value)}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m =>
            <option key={m} value={m}>Tháng {m}</option>
          )}
        </select>
        <select style={SEL} value={year} onChange={e => setYear(+e.target.value)}>
          {[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select
          style={{ ...SEL, background: deptLocked ? '#f8fafc' : 'white' }}
          value={deptId}
          onChange={e => !deptLocked && setDeptId(e.target.value)}
          disabled={deptLocked}
        >
          {!deptLocked && <option value="">Tất cả phòng ban</option>}
          {depts
            .filter(d => !allowedDepts || allowedDepts.includes(String(d.id)))
            .map(d => <option key={d.id} value={d.id}>{d.name}</option>)
          }
        </select>

        <input
          placeholder="🔍 Tìm nhân viên..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...SEL, width: 170 }}
        />

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
          {[{ k: 'input', l: '📋 Nhập liệu' }, { k: 'report', l: '📊 Báo cáo' }].map(t => (
            <button key={t.k} onClick={async () => {
              if (t.k === 'report' && Object.keys(pendingRef.current).length > 0) await flushSave()
              setTab(t.k)
            }} style={{
              padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, position: 'relative',
              background: tab === t.k ? '#1a2744' : '#f1f5f9',
              color:      tab === t.k ? 'white'   : '#475569',
            }}>
              {t.l}
              {t.k === 'report' && dirty && (
                <span style={{
                  position: 'absolute', top: 2, right: 2, width: 7, height: 7,
                  borderRadius: '50%', background: '#f59e0b', border: '1.5px solid white',
                }} />
              )}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {canWrite && (
          <button onClick={fillAllWeekdays}
            style={{ ...BTN, background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
            ⚡ Check đủ ngày thường
          </button>
        )}

        {canWrite && (
          <button onClick={flushSave} disabled={saving} style={{
            ...BTN, fontWeight: 700,
            background: saving        ? '#94a3b8'
                      : saveStatus === 'saved' ? '#16a34a'
                      : dirty        ? '#f59e0b'
                      : '#e2e8f0',
            color: (saving || saveStatus === 'saved' || dirty) ? 'white' : '#94a3b8',
          }}>
            {saving               ? '⏳ Đang lưu...'
              : saveStatus === 'saved' ? '✓ Đã lưu'
              : dirty              ? '💾 Lưu (có thay đổi)'
              : '💾 Lưu'}
          </button>
        )}

        {canExport && (
          <button onClick={handleExport} style={{ ...BTN, background: '#1a2744', color: 'white' }}>
            ⬇ Xuất Excel
          </button>
        )}
      </div>

      {/* ── Excel Grid ─────────────────────────────────────────────────────── */}
      {tab === 'input' && (
        <div
          ref={containerRef}
          tabIndex={0}
          onKeyDown={handleGridKeyDown}
          style={{ flex: 1, overflow: 'auto', outline: 'none', position: 'relative' }}
        >
          <table style={{
            borderCollapse: 'separate', borderSpacing: 0, fontSize: 12, tableLayout: 'fixed',
            minWidth: FIXED_W + numDays * DAY_W + SUM_COLS.length * 46,
            userSelect: 'none',
          }}>
            <colgroup>
              {FCOLS.map(c => <col key={c.key} style={{ width: c.w }} />)}
              {days.map(d => <col key={d} style={{ width: DAY_W }} />)}
              {SUM_COLS.map(c => <col key={c.key} style={{ width: 46 }} />)}
            </colgroup>

            {/* ── Header ─────────────────────────────────────────────────── */}
            <thead>
              <tr>
                {FCOLS.map((c, i) => (
                  <th key={c.key} style={{
                    ...TH,
                    position: 'sticky', top: 0, left: c.left,
                    zIndex: 6,
                    width: c.w,
                    textAlign: c.key === 'name' ? 'left' : 'center',
                    paddingLeft: c.key === 'name' ? 8 : 4,
                    fontSize: c.key === 'spec' || c.key === 'line' ? 9.5 : 11,
                    borderRight: c.key === 'line'
                      ? '2px solid rgba(255,255,255,.4)'
                      : '1px solid rgba(255,255,255,.12)',
                  }}>
                    {c.label}
                  </th>
                ))}

                {days.map(d => {
                  const dow  = new Date(year, month - 1, d).getDay()
                  const isW  = dow === 0 || dow === 6
                  const isTo = d === today.getDate() && month === today.getMonth() + 1 && year === today.getFullYear()
                  return (
                    <th key={d} style={{
                      ...TH,
                      position: 'sticky', top: 0, zIndex: 3,
                      width: DAY_W, padding: '3px 1px',
                      background: isTo ? '#dc2626' : isW ? '#2d4a8a' : '#1a2744',
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700 }}>{d}</div>
                      <div style={{ fontSize: 8, opacity: .65 }}>{DOW_SHORT[dow]}</div>
                    </th>
                  )
                })}

                {SUM_COLS.map(c => (
                  <th key={c.key} style={{
                    ...TH, position: 'sticky', top: 0, zIndex: 3,
                    background: '#2d3f6b', fontSize: 9.5, whiteSpace: 'pre-line', lineHeight: 1.3,
                  }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>

            {/* ── Body ────────────────────────────────────────────────────── */}
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={FCOLS.length + numDays + SUM_COLS.length}
                    style={{ textAlign: 'center', padding: 28, color: '#94a3b8', fontSize: 14 }}>
                    Đang tải dữ liệu...
                  </td>
                </tr>
              )}

              {!isLoading && filteredP.map((p, pi) => {
                const pid     = String(p.id)
                const machine = isMachine(pid)
                const rowBg   = pi % 2 === 0 ? 'white' : '#f8fafc'
                const summ    = personSummary(pid)

                if (!machine) {
                  return (
                    <tr key={pid}>
                      {stickyInfoCells(p, pi, rowBg, true, true, false)}
                      {lineLabelCell('', false, '#94a3b8', true)}
                      {days.map(day => renderEditableCell(pid, 0, day, rowBg))}
                      {renderSummaryCells(summ)}
                    </tr>
                  )
                }

                return (
                  <Fragment key={pid}>
                    {/* TỔNG (tự tính) */}
                    <tr>
                      {stickyInfoCells(p, pi, rowBg, true, false, true)}
                      {lineLabelCell('TỔNG', true, '#1a2744', false)}
                      {days.map(day => renderTongCell(pid, day))}
                      {renderSummaryCells(summ)}
                    </tr>
                    {/* Lái máy */}
                    <tr>
                      {stickyInfoCells(p, pi, rowBg, false, false, true)}
                      {lineLabelCell('Lái máy', false, '#1d4ed8', false)}
                      {days.map(day => renderEditableCell(pid, 1, day, rowBg))}
                      {renderEmptySummaryCells()}
                    </tr>
                    {/* Việc khác */}
                    <tr>
                      {stickyInfoCells(p, pi, rowBg, false, true, true)}
                      {lineLabelCell('Việc khác', false, '#0e7490', true)}
                      {days.map(day => renderEditableCell(pid, 2, day, rowBg))}
                      {renderEmptySummaryCells()}
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>

            {/* ── Footer tổng cộng ──────────────────────────────────────── */}
            {filteredP.length > 0 && !isLoading && (
              <tfoot>
                <tr style={{ background: '#e8ecf4' }}>
                  <td colSpan={FCOLS.length} style={{
                    ...TD, textAlign: 'right', paddingRight: 10,
                    fontWeight: 700, fontSize: 11, color: '#1a2744',
                    position: 'sticky', left: 0, background: '#e8ecf4', zIndex: 2,
                    borderRight: '2px solid #cbd5e1',
                  }}>
                    Tổng cộng (giờ)
                  </td>
                  {days.map(day => {
                    const dow   = new Date(year, month - 1, day).getDay()
                    const isW   = dow === 0 || dow === 6
                    const total = filteredP.reduce((s, p) => s + dayTotal(String(p.id), day), 0)
                    return (
                      <td key={day} style={{
                        ...TD, textAlign: 'center', fontWeight: 700, fontSize: 11,
                        background: isW ? '#fef9ee' : '#e8ecf4',
                        color: total > 0 ? '#1a2744' : '#d1d5db',
                      }}>
                        {total > 0 ? +total.toFixed(1) : ''}
                      </td>
                    )
                  })}
                  {(() => {
                    const allSumm = filteredP.map(p => personSummary(String(p.id)))
                    return SUM_COLS.map(c => (
                      <td key={c.key} style={{
                        ...TD, textAlign: 'center', fontWeight: 700,
                        background: '#d4d9f0', color: c.color,
                        borderLeft: c.key === 'leave' ? '2px solid #c7d2fe' : undefined,
                      }}>
                        {(() => { const t = +allSumm.reduce((s, x) => s + x[c.key], 0).toFixed(1); return t > 0 ? t : '' })()}
                      </td>
                    ))
                  })()}
                </tr>
              </tfoot>
            )}
          </table>

          {!isLoading && filteredP.length === 0 && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              color: '#94a3b8', pointerEvents: 'none',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>👥</div>
                <div style={{ fontWeight: 600 }}>Không tìm thấy nhân viên</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Thử thay đổi bộ lọc hoặc tìm kiếm</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Báo cáo ────────────────────────────────────────────────────────── */}
      {tab === 'report' && (
        <ReportTab
          rows={rows}
          personnel={filteredP}
          depts={depts}
          days={days}
          numDays={numDays}
          year={year}
          month={month}
          isLoading={isLoading}
        />
      )}

      {/* ── Thanh trạng thái + chú thích mã ───────────────────────────────── */}
      {tab === 'input' && (
        <div style={{
          padding: '4px 16px', fontSize: 10.5, color: '#94a3b8', background: 'white',
          borderTop: '1px solid #f1f5f9', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <span style={{ color: '#475569', fontWeight: 600 }}>{filteredP.length} nhân viên</span>
            <span>Nhập số giờ hoặc mã ký hiệu · Enter = xuống · Tab = sang phải · Delete = xoá · Ctrl+S = lưu · 🚜 = bật chế độ lái máy</span>
            {dirty && (
              <span style={{ color: '#f59e0b', fontWeight: 700, marginLeft: 'auto' }}>
                ● Có thay đổi chưa lưu
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
            {Object.entries(CODES).map(([code, c]) => (
              <span key={code} style={{
                background: c.bg, color: c.color, borderRadius: 4,
                padding: '0px 6px', fontSize: 9.5, fontWeight: 700, whiteSpace: 'nowrap',
              }}>
                {code} <span style={{ fontWeight: 400 }}>{c.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: toast.startsWith('✓') ? '#16a34a' : toast.startsWith('❌') ? '#dc2626' : '#1a2744',
          color: 'white', padding: '11px 28px', borderRadius: 12, zIndex: 9999,
          fontSize: 14, fontWeight: 700, boxShadow: '0 6px 24px rgba(0,0,0,.3)',
          pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}

// ─── ReportTab ────────────────────────────────────────────────────────────────

function ReportTab({ rows, personnel, depts, days, numDays, year, month, isLoading }) {
  if (isLoading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
      Đang tải...
    </div>
  )

  const deptMap = Object.fromEntries((depts || []).map(d => [String(d.id), d.name]))

  // Gom dòng DB theo nhân viên
  const byPid  = {}
  const pInfo  = {}
  for (const r of rows) {
    const pid = String(r.personnel_id)
    ;(byPid[pid] = byPid[pid] || {})[r.row_index] = r
    if (!pInfo[pid]) {
      pInfo[pid] = {
        id: r.personnel_id,
        full_name:       r.full_name || '',
        employee_code:   r.employee_code || '',
        department_name: r.department_name || '',
        position:        r.position_text || '',
        phone:           r.mobile || r.phone || '',
      }
    }
  }

  function summarize(pid) {
    const idxRows = byPid[pid] || {}
    const machine = !!(idxRows[1] || idxRows[2])
    const lines   = (machine ? [1, 2] : [0]).map(i => idxRows[i]?.hours || {})
    const dayVals = {} // d -> {total, code}
    let leave = 0, otH = 0, otDays = 0, lt8 = 0, eq8 = 0, gt8 = 0

    for (let d = 1; d <= numDays; d++) {
      let total = 0, code = null
      for (const hrs of lines) {
        const v = hrs[String(d)]
        if (v === undefined || v === null || v === '') continue
        if (isCodeVal(v)) { if (!code) code = String(v).toUpperCase() }
        else total += numVal(v)
      }
      total = +total.toFixed(1)
      if (total > 0) {
        dayVals[d] = { total }
        if (total < 8) lt8++
        else if (total === 8) eq8++
        else gt8++
        const ot = Math.max(0, total - 8)
        otH += ot
        if (ot > 2) otDays++
      } else if (code) {
        dayVals[d] = { code }
        if (code === 'CP') leave++
      }
    }
    return {
      machine, dayVals,
      machineLabel: machine ? (idxRows[1]?.row_label || 'Lái máy') : '',
      summ: { leave, otH: +otH.toFixed(1), otDays, lt8, eq8, gt8, totalDays: lt8 + eq8 + gt8 },
    }
  }

  const seenPids = new Set(Object.keys(pInfo))
  const allFromP = (personnel || []).map(p => ({
    id: p.id,
    full_name:       p.full_name || '',
    employee_code:   p.employee_code || '',
    department_name: deptMap[String(p.department_id)] || p.department_name || '',
    position:        p.position || '',
    phone:           p.mobile || p.phone || '',
  }))

  const withData    = Object.values(pInfo).sort((a, b) => a.full_name.localeCompare(b.full_name, 'vi'))
  const withoutData = allFromP.filter(p => !seenPids.has(String(p.id)))
  const displayList = [...withData, ...withoutData]

  if (!displayList.length) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: '#94a3b8' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
        <div style={{ fontWeight: 600 }}>Chưa có dữ liệu chấm công tháng này</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>Nhập liệu ở tab "Nhập liệu" và nhấn 💾 Lưu trước khi xem báo cáo</div>
      </div>
    </div>
  )

  const SUM_HEAD = ['Nghỉ phép', 'TC (h)', 'TC>2h', '<8h', '8h', '>8h', 'Tổng công']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: '8px 16px', background: 'white', borderBottom: '1px solid #e2e8f0',
        fontSize: 13, fontWeight: 700, color: '#1a2744', flexShrink: 0,
      }}>
        Báo cáo tháng {month}/{year} — {withData.length} nhân viên có dữ liệu
        {withoutData.length > 0 && (
          <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 8, fontSize: 12 }}>
            + {withoutData.length} chưa có
          </span>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 11, minWidth: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: 32, position: 'sticky', left: 0, zIndex: 4 }}>STT</th>
              <th style={{ ...TH, width: 150, position: 'sticky', left: 32, zIndex: 4, textAlign: 'left', paddingLeft: 8 }}>Họ và tên</th>
              <th style={{ ...TH, width: 100, position: 'sticky', left: 182, zIndex: 4, fontSize: 9.5 }}>Chuyên môn/Máy</th>
              {days.map(d => {
                const dow = new Date(year, month - 1, d).getDay()
                const isW = dow === 0 || dow === 6
                return (
                  <th key={d} style={{ ...TH, width: 30, padding: '4px 1px', background: isW ? '#2d4a8a' : '#1a2744' }}>
                    <div style={{ fontSize: 10 }}>{d}</div>
                    <div style={{ fontSize: 8, opacity: .7 }}>{DOW_SHORT[dow]}</div>
                  </th>
                )
              })}
              {SUM_HEAD.map(h => (
                <th key={h} style={{ ...TH, width: 52, background: '#2d3f6b', fontSize: 9.5 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayList.map((p, gi) => {
              const pid = String(p.id)
              const { machine, machineLabel, dayVals, summ } = summarize(pid)
              const hasData = Object.keys(dayVals).length > 0
              const bg      = gi % 2 === 1 ? '#f8fafc' : 'white'

              return (
                <tr key={pid} style={{ background: bg, opacity: hasData ? 1 : 0.45 }}>
                  <td style={{ ...TD, textAlign: 'center', fontWeight: 700, color: '#64748b', position: 'sticky', left: 0, background: bg }}>{gi + 1}</td>
                  <td style={{ ...TD, position: 'sticky', left: 32, background: bg, fontWeight: hasData ? 700 : 400, paddingLeft: 8, whiteSpace: 'nowrap' }}>
                    {p.full_name}
                    <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 400 }}>
                      {[p.position, p.phone].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td style={{ ...TD, position: 'sticky', left: 182, background: bg, fontSize: 9.5, color: machine ? '#1d4ed8' : '#64748b', fontWeight: machine ? 700 : 400, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {machine ? machineLabel : (hasData ? 'Chuyên môn' : p.department_name)}
                  </td>
                  {days.map(d => {
                    const v   = dayVals[d]
                    const dow = new Date(year, month - 1, d).getDay()
                    const isW = dow === 0 || dow === 6
                    const cs  = v?.code ? codeStyle(v.code) : null
                    return (
                      <td key={d} style={{
                        ...TD, textAlign: 'center', width: 30,
                        background: cs ? cs.bg : v?.total > 8 ? '#dcfce7' : isW ? '#fffbeb' : bg,
                        color: cs ? cs.color : v?.total > 8 ? '#16a34a' : '#1e293b',
                        fontWeight: (cs || v?.total > 8) ? 700 : 400,
                        fontSize: cs ? 8.5 : 10,
                      }}>
                        {cs ? v.code : (v?.total || '')}
                      </td>
                    )
                  })}
                  {[summ.leave, summ.otH, summ.otDays, summ.lt8, summ.eq8, summ.gt8, summ.totalDays].map((v, i) => (
                    <td key={i} style={{
                      ...TD, textAlign: 'center', background: '#e8ecf4', fontWeight: 700,
                      color: v > 0 ? (i === 6 ? '#4338ca' : i >= 1 && i <= 2 ? '#d97706' : '#1e293b') : '#cbd5e1',
                    }}>
                      {v > 0 ? v : ''}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const SEL = {
  padding: '6px 10px', borderRadius: 8, border: '1px solid #dde1e7',
  fontSize: 12, background: 'white', outline: 'none',
}

const BTN = {
  padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
  fontSize: 12, fontWeight: 600,
}

const TH = {
  background: '#1a2744', color: 'white', padding: '6px 4px', textAlign: 'center',
  borderRight: '1px solid rgba(255,255,255,0.12)', whiteSpace: 'nowrap',
  position: 'sticky', top: 0, zIndex: 2, fontSize: 11,
}

const TD = {
  padding: '2px 4px', borderBottom: '1px solid #eef0f3', borderRight: '1px solid #eef0f3',
  verticalAlign: 'middle', height: 26,
}
