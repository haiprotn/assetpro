/**
 * TimesheetPage v4 — Giao diện Excel
 * Ma trận: Nhân viên (hàng) × Ngày (cột) · Click ô để nhập · Phím mũi tên điều hướng
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { timesheetApi, personnelApi, deptApi } from '../services/api'
import { useAuthStore } from '../store/authStore'

const today = new Date()
const DOW_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

function daysInMonth(y, m) { return new Date(y, m, 0).getDate() }

// Cột cố định (sticky left)
const FCOLS = [
  { key: 'stt',  label: 'STT',       w: 44,  left: 0   },
  { key: 'name', label: 'Họ và tên', w: 160, left: 44  },
  { key: 'code', label: 'Mã NV',     w: 72,  left: 204 },
  { key: 'dept', label: 'Bộ phận',   w: 110, left: 276 },
]
const FIXED_W = 386
const DAY_W   = 34

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

  // Ô đang chọn / đang chỉnh sửa
  const [selCell,   setSelCell]   = useState(null) // {ri, day}
  const [editCell,  setEditCell]  = useState(null) // {ri, day}
  const [editVal,   setEditVal]   = useState('')
  const [editLeave, setEditLeave] = useState(null) // {ri}
  const [leaveVal,  setLeaveVal]  = useState('')

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

  const enrichedP = allPersonnel.map(p => ({
    ...p,
    department_name: deptMap[String(p.department_id)]?.name || p.department_name || '',
  }))

  const filteredP = enrichedP.filter(p => {
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
    setEditLeave(null)
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
          .map(([k, v]) => [k, Number(v)])
          .filter(([, v]) => v > 0)
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

  function getMainRow(pid) {
    return drafts[`${pid}:0`] ||
           (byPid[pid] || []).find(r => r.row_index === 0) ||
           null
  }

  // Tổng giờ ngày d (tất cả dòng, bao gồm draft)
  function getTotalHours(pid, day) {
    const dbPidRows = byPid[pid] || []
    const seenIdxs  = new Set()
    let total = 0

    for (const r of dbPidRows) {
      const row = drafts[`${pid}:${r.row_index}`] || r
      seenIdxs.add(r.row_index)
      total += parseFloat((row.hours || {})[String(day)] || 0) || 0
    }
    for (const [key, draft] of Object.entries(drafts)) {
      if (!key.startsWith(pid + ':')) continue
      const idx = +key.split(':')[1]
      if (seenIdxs.has(idx)) continue
      total += parseFloat((draft.hours || {})[String(day)] || 0) || 0
    }
    return +total.toFixed(1)
  }

  function patchMainRow(pid, patch) {
    const mainDb = (byPid[pid] || []).find(r => r.row_index === 0)
    const base   = drafts[`${pid}:0`] || mainDb || {
      id: null, personnel_id: pid, year, month, row_index: 0,
      row_label: null, work_description: 'Làm việc chuyên môn',
      hours: {}, leave_days: 0, notes: null,
    }
    const draft = { ...base, ...patch }
    const key   = `${pid}:0`
    setDrafts(prev => ({ ...prev, [key]: draft }))
    pendingRef.current = { ...pendingRef.current, [key]: draft }
    setDirty(true)
  }

  function patchHour(pid, day, value) {
    const main  = getMainRow(pid)
    const hours = { ...(main?.hours || {}) }
    const v = parseFloat(value)
    if (isNaN(v) || v <= 0) delete hours[String(day)]
    else hours[String(day)] = v
    patchMainRow(pid, { hours })
  }

  // ── Tóm tắt tháng ────────────────────────────────────────────────────────

  function personSummary(pid) {
    const dayTotals = {}
    const dbPidRows = byPid[pid] || []
    const seenIdxs  = new Set()

    for (const r of dbPidRows) {
      const row = drafts[`${pid}:${r.row_index}`] || r
      seenIdxs.add(r.row_index)
      for (let d = 1; d <= numDays; d++) {
        const h = parseFloat((row.hours || {})[String(d)] || 0)
        if (h > 0) dayTotals[d] = (dayTotals[d] || 0) + h
      }
    }
    for (const [key, draft] of Object.entries(drafts)) {
      if (!key.startsWith(pid + ':')) continue
      const idx = +key.split(':')[1]
      if (seenIdxs.has(idx)) continue
      for (let d = 1; d <= numDays; d++) {
        const h = parseFloat((draft.hours || {})[String(d)] || 0)
        if (h > 0) dayTotals[d] = (dayTotals[d] || 0) + h
      }
    }

    const workDays = Object.keys(dayTotals).length
    const totalH   = +Object.values(dayTotals).reduce((s, h) => s + h, 0).toFixed(1)
    const otH      = +Object.values(dayTotals).map(h => Math.max(0, h - 8)).reduce((s, h) => s + h, 0).toFixed(1)
    const main     = getMainRow(pid)
    const leave    = parseFloat(main?.leave_days || 0)

    return { workDays, totalH, otH, leave }
  }

  // ── Chỉnh sửa ô ──────────────────────────────────────────────────────────

  function startEditHour(ri, day, initialVal) {
    if (!canWrite) return
    const pid = String(filteredP[ri]?.id)
    if (!pid) return
    const h = getTotalHours(pid, day)
    setSelCell({ ri, day })
    setEditCell({ ri, day })
    setEditLeave(null)
    setEditVal(initialVal !== undefined ? initialVal : (h > 0 ? String(h) : ''))
  }

  function commitHour(ri, day, val) {
    const pid = String(filteredP[ri]?.id)
    if (pid) patchHour(pid, day, val)
    setEditCell(null)
    setEditVal('')
  }

  function startEditLeave(ri) {
    if (!canWrite) return
    const pid  = String(filteredP[ri]?.id)
    if (!pid) return
    const main = getMainRow(pid)
    const l    = parseFloat(main?.leave_days || 0)
    setEditLeave({ ri })
    setLeaveVal(l > 0 ? String(l) : '')
    setEditCell(null)
    setSelCell(null)
  }

  function commitLeave(ri, val) {
    const pid = String(filteredP[ri]?.id)
    if (pid) patchMainRow(pid, { leave_days: parseFloat(val) || 0 })
    setEditLeave(null)
    setLeaveVal('')
  }

  // ── Điều hướng phím ──────────────────────────────────────────────────────

  function handleGridKeyDown(e) {
    if (editCell || editLeave) return
    if (!selCell) return
    const { ri, day } = selCell
    const n = filteredP.length

    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); setSelCell({ ri, day: Math.min(day + 1, numDays) }); break
      case 'ArrowLeft':  e.preventDefault(); setSelCell({ ri, day: Math.max(day - 1, 1) });       break
      case 'ArrowDown':  e.preventDefault(); setSelCell({ ri: Math.min(ri + 1, n - 1), day });    break
      case 'ArrowUp':    e.preventDefault(); setSelCell({ ri: Math.max(ri - 1, 0), day });        break
      case 'Tab':
        e.preventDefault()
        if (e.shiftKey) setSelCell({ ri, day: Math.max(day - 1, 1) })
        else            setSelCell({ ri, day: Math.min(day + 1, numDays) })
        break
      case 'Enter': case 'F2':
        e.preventDefault()
        startEditHour(ri, day)
        break
      case 'Delete': case 'Backspace':
        e.preventDefault()
        { const pid = String(filteredP[ri]?.id); if (pid) patchHour(pid, day, '') }
        break
      default:
        if (/^[0-9.]$/.test(e.key)) startEditHour(ri, day, e.key)
    }
  }

  // ── Check đủ ngày thường ─────────────────────────────────────────────────

  function fillAllWeekdays() {
    const newDrafts  = { ...drafts }
    const newPending = { ...pendingRef.current }

    for (const p of filteredP) {
      const pid  = String(p.id)
      const main = getMainRow(pid)
      const base = main || {
        id: null, personnel_id: pid, year, month, row_index: 0,
        row_label: null, work_description: 'Làm việc chuyên môn',
        hours: {}, leave_days: 0, notes: null,
      }
      const hours = { ...(base.hours || {}) }
      for (let d = 1; d <= numDays; d++) {
        const dow = new Date(year, month - 1, d).getDay()
        if (dow !== 0 && dow !== 6) hours[String(d)] = 8
      }
      const draft = { ...base, hours }
      const key   = `${pid}:0`
      newDrafts[key]  = draft
      newPending[key] = draft
    }
    setDrafts(newDrafts)
    pendingRef.current = newPending
    setDirty(true)
    showToast(`⚡ Đã check ${filteredP.length} nhân viên`)
  }

  // ── Xóa tất cả ngày nghỉ (cuối tuần) ────────────────────────────────────

  function clearWeekends() {
    const newDrafts  = { ...drafts }
    const newPending = { ...pendingRef.current }

    for (const p of filteredP) {
      const pid  = String(p.id)
      const main = getMainRow(pid)
      if (!main) continue
      const hours = { ...(main.hours || {}) }
      let changed = false
      for (let d = 1; d <= numDays; d++) {
        const dow = new Date(year, month - 1, d).getDay()
        if ((dow === 0 || dow === 6) && hours[String(d)]) {
          delete hours[String(d)]
          changed = true
        }
      }
      if (!changed) continue
      const draft = { ...main, hours }
      const key   = `${pid}:0`
      newDrafts[key]  = draft
      newPending[key] = draft
    }
    setDrafts(newDrafts)
    pendingRef.current = newPending
    setDirty(true)
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
            borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed',
            minWidth: FIXED_W + numDays * DAY_W + 220,
            userSelect: 'none',
          }}>
            <colgroup>
              {FCOLS.map(c => <col key={c.key} style={{ width: c.w }} />)}
              {days.map(d => <col key={d} style={{ width: DAY_W }} />)}
              <col style={{ width: 50 }} />{/* Ngày công */}
              <col style={{ width: 58 }} />{/* Tổng giờ */}
              <col style={{ width: 50 }} />{/* TC */}
              <col style={{ width: 58 }} />{/* NP */}
            </colgroup>

            {/* ── Header ─────────────────────────────────────────────────── */}
            <thead>
              <tr>
                {FCOLS.map((c, i) => (
                  <th key={c.key} style={{
                    ...TH,
                    position: 'sticky', top: 0, left: c.left,
                    zIndex: i <= 1 ? 6 : 5,
                    width: c.w,
                    textAlign: c.key === 'name' ? 'left' : 'center',
                    paddingLeft: c.key === 'name' ? 8 : 4,
                    borderRight: c.key === 'dept'
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

                {['Ngày\ncông', 'Tổng\ngiờ', 'TC\n(h)', 'Nghỉ\nphép'].map(h => (
                  <th key={h} style={{
                    ...TH, position: 'sticky', top: 0, zIndex: 3,
                    background: '#2d3f6b', fontSize: 10, whiteSpace: 'pre-line', lineHeight: 1.3,
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            {/* ── Body ────────────────────────────────────────────────────── */}
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={FCOLS.length + numDays + 4}
                    style={{ textAlign: 'center', padding: 28, color: '#94a3b8', fontSize: 14 }}>
                    Đang tải dữ liệu...
                  </td>
                </tr>
              )}

              {filteredP.map((p, ri) => {
                const pid    = String(p.id)
                const rowBg  = ri % 2 === 0 ? 'white' : '#f8fafc'
                const { workDays, totalH, otH, leave } = personSummary(pid)

                return (
                  <tr key={pid}>
                    {/* STT */}
                    <td style={{
                      ...TD, position: 'sticky', left: 0, background: rowBg, zIndex: 2,
                      textAlign: 'center', fontWeight: 600, color: '#94a3b8', fontSize: 11,
                    }}>
                      {ri + 1}
                    </td>

                    {/* Họ tên */}
                    <td style={{
                      ...TD, position: 'sticky', left: 44, background: rowBg, zIndex: 2,
                      paddingLeft: 8,
                    }}>
                      <div style={{
                        fontSize: 12.5, fontWeight: 700, color: '#1e293b',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 148,
                      }}>
                        {p.full_name}
                      </div>
                      {p.position && (
                        <div style={{
                          fontSize: 9.5, color: '#94a3b8',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 148,
                        }}>
                          {p.position}
                        </div>
                      )}
                    </td>

                    {/* Mã NV */}
                    <td style={{
                      ...TD, position: 'sticky', left: 204, background: rowBg, zIndex: 2,
                      textAlign: 'center', fontSize: 11, color: '#64748b',
                    }}>
                      {p.employee_code || '—'}
                    </td>

                    {/* Bộ phận */}
                    <td style={{
                      ...TD, position: 'sticky', left: 276, background: rowBg, zIndex: 2,
                      fontSize: 10, color: '#64748b', borderRight: '2px solid #e2e8f0',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {p.department_name || '—'}
                    </td>

                    {/* Ô ngày */}
                    {days.map(day => {
                      const h      = getTotalHours(pid, day)
                      const dow    = new Date(year, month - 1, day).getDay()
                      const isWknd = dow === 0 || dow === 6
                      const isSel  = selCell?.ri === ri && selCell?.day === day
                      const isEdit = editCell?.ri === ri && editCell?.day === day
                      const isOt   = h > 8

                      let cellBg = isWknd ? '#fef9ee' : rowBg
                      if (h > 0 && !isSel) cellBg = isOt ? '#dcfce7' : isWknd ? '#fef3c7' : '#f0fdf4'
                      if (isSel && !isEdit) cellBg = '#dbeafe'

                      return (
                        <td
                          key={day}
                          onClick={() => startEditHour(ri, day)}
                          style={{
                            ...TD,
                            width: DAY_W, padding: 0, textAlign: 'center',
                            background: cellBg,
                            outline: isSel ? '2px solid #2563eb' : 'none',
                            outlineOffset: '-1px',
                            cursor: canWrite ? 'cell' : 'default',
                          }}
                        >
                          {isEdit ? (
                            <input
                              autoFocus
                              type="number" min={0} max={24} step={0.5}
                              value={editVal}
                              onChange={e => setEditVal(e.target.value)}
                              onBlur={() => commitHour(ri, day, editVal)}
                              onKeyDown={e => {
                                e.stopPropagation()
                                if (e.key === 'Escape') { setEditCell(null); setEditVal(''); return }
                                if (e.key === 'Enter') {
                                  commitHour(ri, day, editVal)
                                  const nri = Math.min(ri + 1, filteredP.length - 1)
                                  startEditHour(nri, day)
                                  return
                                }
                                if (e.key === 'Tab') {
                                  e.preventDefault()
                                  commitHour(ri, day, editVal)
                                  const nd = e.shiftKey
                                    ? Math.max(day - 1, 1)
                                    : Math.min(day + 1, numDays)
                                  startEditHour(ri, nd)
                                  return
                                }
                                if (e.key === 'ArrowDown') {
                                  commitHour(ri, day, editVal)
                                  startEditHour(Math.min(ri + 1, filteredP.length - 1), day)
                                  return
                                }
                                if (e.key === 'ArrowUp') {
                                  commitHour(ri, day, editVal)
                                  startEditHour(Math.max(ri - 1, 0), day)
                                  return
                                }
                                if (e.key === 'ArrowRight') {
                                  commitHour(ri, day, editVal)
                                  startEditHour(ri, Math.min(day + 1, numDays))
                                  return
                                }
                                if (e.key === 'ArrowLeft') {
                                  commitHour(ri, day, editVal)
                                  startEditHour(ri, Math.max(day - 1, 1))
                                }
                              }}
                              style={{
                                width: '100%', height: 28, border: 'none',
                                background: 'white', textAlign: 'center',
                                fontSize: 13, fontWeight: 700, outline: 'none', padding: 0,
                                color: isOt ? '#16a34a' : isWknd ? '#d97706' : '#1e293b',
                              }}
                            />
                          ) : (
                            <div style={{
                              height: 28, lineHeight: '28px', fontSize: 12,
                              fontWeight: h > 0 ? 700 : 300,
                              color: h > 0
                                ? (isOt ? '#16a34a' : isWknd ? '#b45309' : '#1e293b')
                                : isWknd ? '#fbbf24' : '#e5e7eb',
                            }}>
                              {h > 0 ? h : isWknd ? '—' : ''}
                            </div>
                          )}
                        </td>
                      )
                    })}

                    {/* Tóm tắt */}
                    <td style={{
                      ...TD, textAlign: 'center', fontWeight: 700,
                      background: '#eef2ff', color: '#4338ca',
                      borderLeft: '2px solid #c7d2fe', fontSize: 13,
                    }}>
                      {workDays || ''}
                    </td>
                    <td style={{
                      ...TD, textAlign: 'center', fontWeight: 700,
                      background: '#eef2ff', color: totalH > 0 ? '#15803d' : '#94a3b8', fontSize: 13,
                    }}>
                      {totalH || ''}
                    </td>
                    <td style={{
                      ...TD, textAlign: 'center', fontWeight: 700,
                      background: '#eef2ff', color: otH > 0 ? '#d97706' : '#94a3b8', fontSize: 13,
                    }}>
                      {otH || ''}
                    </td>
                    {/* Nghỉ phép — editable */}
                    <td
                      onClick={() => startEditLeave(ri)}
                      style={{
                        ...TD, textAlign: 'center', fontWeight: 700,
                        background: '#fffbeb', color: '#92400e', fontSize: 13,
                        cursor: canWrite ? 'cell' : 'default',
                      }}
                    >
                      {editLeave?.ri === ri ? (
                        <input
                          autoFocus
                          type="number" min={0} step={0.5}
                          value={leaveVal}
                          onChange={e => setLeaveVal(e.target.value)}
                          onBlur={() => commitLeave(ri, leaveVal)}
                          onKeyDown={e => {
                            e.stopPropagation()
                            if (e.key === 'Enter' || e.key === 'Escape') commitLeave(ri, leaveVal)
                          }}
                          style={{
                            width: '100%', height: 28, border: 'none',
                            background: '#fffbeb', textAlign: 'center',
                            fontSize: 12, fontWeight: 700, outline: 'none', color: '#92400e',
                          }}
                        />
                      ) : (
                        leave || ''
                      )}
                    </td>
                  </tr>
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
                  }}>
                    Tổng cộng
                  </td>
                  {days.map(day => {
                    const dow   = new Date(year, month - 1, day).getDay()
                    const isW   = dow === 0 || dow === 6
                    const total = filteredP.reduce((s, p) => s + getTotalHours(String(p.id), day), 0)
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
                  {/* Summary totals */}
                  {(() => {
                    const allSumm = filteredP.map(p => personSummary(String(p.id)))
                    return (
                      <>
                        <td style={{ ...TD, textAlign: 'center', fontWeight: 700, background: '#d4d9f0', color: '#4338ca', borderLeft: '2px solid #c7d2fe' }}>
                          {allSumm.reduce((s, x) => s + x.workDays, 0) || ''}
                        </td>
                        <td style={{ ...TD, textAlign: 'center', fontWeight: 700, background: '#d4d9f0', color: '#15803d' }}>
                          {+allSumm.reduce((s, x) => s + x.totalH, 0).toFixed(1) || ''}
                        </td>
                        <td style={{ ...TD, textAlign: 'center', fontWeight: 700, background: '#d4d9f0', color: '#d97706' }}>
                          {+allSumm.reduce((s, x) => s + x.otH, 0).toFixed(1) || ''}
                        </td>
                        <td style={{ ...TD, textAlign: 'center', fontWeight: 700, background: '#fef3c7', color: '#92400e' }}>
                          {+allSumm.reduce((s, x) => s + x.leave, 0).toFixed(1) || ''}
                        </td>
                      </>
                    )
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

      {/* ── Thanh trạng thái ───────────────────────────────────────────────── */}
      {tab === 'input' && (
        <div style={{
          padding: '4px 16px', fontSize: 10.5, color: '#94a3b8', background: 'white',
          borderTop: '1px solid #f1f5f9', flexShrink: 0,
          display: 'flex', gap: 16, alignItems: 'center',
        }}>
          <span style={{ color: '#475569', fontWeight: 600 }}>{filteredP.length} nhân viên</span>
          <span>Click ô để nhập · Enter = xuống · Tab = sang phải · Mũi tên = di chuyển · Delete = xoá · Ctrl+S = lưu</span>
          {dirty && (
            <span style={{ color: '#f59e0b', fontWeight: 700, marginLeft: 'auto' }}>
              ● Có thay đổi chưa lưu
            </span>
          )}
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

  const pidDayMap      = {}
  const pidSummary     = {}
  const pidInfoFromRows = {}

  for (const r of rows) {
    const pid = String(r.personnel_id)
    if (!pidDayMap[pid]) pidDayMap[pid] = {}
    if (!pidInfoFromRows[pid]) {
      pidInfoFromRows[pid] = {
        id:              r.personnel_id,
        full_name:       r.full_name || '',
        employee_code:   r.employee_code || '',
        department_name: r.department_name || deptMap[String(r.department_id)] || '',
        position:        r.position_text || '',
        department_id:   r.department_id,
      }
    }
    for (let d = 1; d <= numDays; d++) {
      const h = parseFloat((r.hours || {})[String(d)] || 0)
      if (h > 0) pidDayMap[pid][d] = (pidDayMap[pid][d] || 0) + h
    }
    if (r.row_index === 0) {
      pidSummary[pid] = pidSummary[pid] || { leave: 0 }
      pidSummary[pid].leave += parseFloat(r.leave_days || 0)
    }
  }

  const seenPids    = new Set(Object.keys(pidInfoFromRows))
  const allFromP    = (personnel || []).map(p => ({
    id:              p.id,
    full_name:       p.full_name || '',
    employee_code:   p.employee_code || '',
    department_name: deptMap[String(p.department_id)] || p.department_name || '',
    position:        p.position || '',
    department_id:   p.department_id,
  }))

  const withData    = Object.values(pidInfoFromRows).sort((a, b) => a.full_name.localeCompare(b.full_name, 'vi'))
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
        <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: 32, position: 'sticky', left: 0, zIndex: 4 }}>STT</th>
              <th style={{ ...TH, width: 150, position: 'sticky', left: 32, zIndex: 4, textAlign: 'left', paddingLeft: 8 }}>Họ và tên</th>
              <th style={{ ...TH, width: 90, position: 'sticky', left: 182, zIndex: 4 }}>Bộ phận</th>
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
              {['Ngày', 'Tổng h', 'TC (h)', 'NP'].map(h => (
                <th key={h} style={{ ...TH, width: 54, background: '#2d3f6b' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayList.map((p, gi) => {
              const pid     = String(p.id)
              const dmap    = pidDayMap[pid] || {}
              const hasData = Object.keys(dmap).length > 0
              const bg      = gi % 2 === 1 ? '#f8fafc' : 'white'
              const totalH  = +Object.values(dmap).reduce((s, h) => s + h, 0).toFixed(1)
              const workDays = Object.keys(dmap).length
              const otH     = +Object.values(dmap).map(h => Math.max(0, h - 8)).reduce((s, h) => s + h, 0).toFixed(1)
              const leave   = pidSummary[pid]?.leave || 0

              return (
                <tr key={pid} style={{ background: bg, opacity: hasData ? 1 : 0.45 }}>
                  <td style={{ ...TD, textAlign: 'center', fontWeight: 700, color: '#64748b', position: 'sticky', left: 0, background: bg }}>{gi + 1}</td>
                  <td style={{ ...TD, position: 'sticky', left: 32, background: bg, fontWeight: hasData ? 700 : 400, paddingLeft: 8, whiteSpace: 'nowrap' }}>
                    {p.full_name}
                    {p.employee_code && <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 400 }}>{p.employee_code}</div>}
                  </td>
                  <td style={{ ...TD, position: 'sticky', left: 182, background: bg, fontSize: 10, color: '#64748b', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.department_name}
                  </td>
                  {days.map(d => {
                    const h   = dmap[d]
                    const dow = new Date(year, month - 1, d).getDay()
                    const isW = dow === 0 || dow === 6
                    return (
                      <td key={d} style={{
                        ...TD, textAlign: 'center', width: 30,
                        background: h > 8 ? '#dcfce7' : isW ? '#fffbeb' : bg,
                        color: h > 8 ? '#16a34a' : '#1e293b',
                        fontWeight: h > 8 ? 700 : 400, fontSize: 10,
                      }}>
                        {h || ''}
                      </td>
                    )
                  })}
                  <td style={{ ...TD, textAlign: 'center', background: '#e8ecf4', fontWeight: 700 }}>{workDays || ''}</td>
                  <td style={{ ...TD, textAlign: 'center', background: '#e8ecf4', fontWeight: 700, color: totalH > 0 ? '#16a34a' : '#1e293b' }}>{totalH || ''}</td>
                  <td style={{ ...TD, textAlign: 'center', background: '#e8ecf4', fontWeight: 700, color: otH > 0 ? '#d97706' : '#1e293b' }}>{otH || ''}</td>
                  <td style={{ ...TD, textAlign: 'center', background: '#e8ecf4', fontWeight: 700 }}>{leave || ''}</td>
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
  verticalAlign: 'middle', height: 28,
}
