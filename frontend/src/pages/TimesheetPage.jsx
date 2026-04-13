import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { timesheetApi, personnelApi, deptApi } from '../services/api'

// ─── helpers ────────────────────────────────────────────────────────────────

const today = new Date()

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

function calcSummary(hours = {}, numDays) {
  let totalHours = 0, workDays = 0, overtimeHours = 0, otOver2h = 0
  for (let d = 1; d <= numDays; d++) {
    const h = parseFloat(hours[String(d)] || 0)
    if (h > 0) {
      workDays++
      totalHours += h
      const ot = Math.max(0, h - 8)
      overtimeHours += ot
      if (ot > 2) otOver2h++
    }
  }
  return { totalHours, workDays, overtimeHours, otOver2h }
}

// ─── component ──────────────────────────────────────────────────────────────

export default function TimesheetPage() {
  const qc = useQueryClient()

  const [year,   setYear]   = useState(today.getFullYear())
  const [month,  setMonth]  = useState(today.getMonth() + 1)
  const [deptId, setDeptId] = useState('')

  const numDays = daysInMonth(year, month)

  // local edit state: Map<pid, Map<rowIndex, rowDraft>>
  const [edits, setEdits]     = useState({})   // { pid: { rowIdx: rowDraft } }
  const [saving, setSaving]   = useState(false)
  const pendingRef             = useRef({})     // same shape as edits — collects debounced changes

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['timesheet', year, month, deptId],
    queryFn: () => timesheetApi.list({ year, month, ...(deptId ? { dept_id: deptId } : {}) })
      .then(r => r.data),
  })

  const { data: allPersonnel = [] } = useQuery({
    queryKey: ['personnel-all'],
    queryFn: () => personnelApi.getAll().then(r => r.data),
  })

  const { data: depts = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => deptApi.list().then(r => r.data),
  })

  // ── Build display rows ────────────────────────────────────────────────────
  // Group DB rows by personnel_id
  const byPid = {}
  for (const row of rows) {
    const pid = String(row.personnel_id)
    if (!byPid[pid]) byPid[pid] = []
    byPid[pid].push(row)
  }

  // Personnel that are active and match dept filter
  const filteredPersonnel = allPersonnel.filter(p =>
    p.is_active !== false && (!deptId || String(p.department_id) === deptId)
  )

  // For each person, build at least 1 display row (from DB or empty)
  const displayGroups = filteredPersonnel.map(p => {
    const pid = String(p.id)
    const dbRows = byPid[pid] || []
    const base = dbRows.length > 0 ? dbRows : [{
      id: null, personnel_id: p.id, year, month, row_index: 0,
      row_label: null, work_description: null, hours: {}, leave_days: 0, notes: null,
      full_name: p.full_name, employee_code: p.employee_code,
      position_text: p.position, department_name: p.department_name,
    }]
    return { p, rows: base }
  })

  // ── Mutations ─────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: (rows) => timesheetApi.bulkSave(rows),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timesheet', year, month, deptId] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => timesheetApi.deleteRow(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timesheet', year, month, deptId] })
    },
  })

  // ── Auto-save debounce ────────────────────────────────────────────────────

  const saveTimeout = useRef(null)

  const triggerSave = useCallback(() => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(async () => {
      const toSave = pendingRef.current
      if (Object.keys(toSave).length === 0) return
      pendingRef.current = {}

      const payload = []
      for (const pid of Object.keys(toSave)) {
        for (const rowIdx of Object.keys(toSave[pid])) {
          payload.push(toSave[pid][rowIdx])
        }
      }
      if (payload.length > 0) {
        setSaving(true)
        try { await saveMutation.mutateAsync(payload) }
        finally { setSaving(false) }
      }
    }, 1200)
  }, [saveMutation])

  // ── Cell edit handler ─────────────────────────────────────────────────────

  function getRowDraft(pid, rowIdx, baseRow) {
    return edits[pid]?.[rowIdx] ?? baseRow
  }

  function updateHour(pid, rowIdx, baseRow, day, value) {
    const draft = { ...getRowDraft(pid, rowIdx, baseRow) }
    const hours = { ...draft.hours }
    const v = parseFloat(value)
    if (isNaN(v) || v <= 0) delete hours[String(day)]
    else hours[String(day)] = v
    draft.hours = hours
    setEdits(prev => ({
      ...prev,
      [pid]: { ...(prev[pid] || {}), [rowIdx]: draft },
    }))
    pendingRef.current = {
      ...pendingRef.current,
      [pid]: { ...(pendingRef.current[pid] || {}), [rowIdx]: draft },
    }
    triggerSave()
  }

  function updateField(pid, rowIdx, baseRow, field, value) {
    const draft = { ...getRowDraft(pid, rowIdx, baseRow), [field]: value }
    setEdits(prev => ({
      ...prev,
      [pid]: { ...(prev[pid] || {}), [rowIdx]: draft },
    }))
    pendingRef.current = {
      ...pendingRef.current,
      [pid]: { ...(pendingRef.current[pid] || {}), [rowIdx]: draft },
    }
    triggerSave()
  }

  function addRow(pid, existingRows) {
    const nextIdx = existingRows.length   // 0-based
    const last = existingRows[existingRows.length - 1]
    const newRow = {
      id: null, personnel_id: pid, year, month, row_index: nextIdx,
      row_label: null, work_description: null, hours: {}, leave_days: 0, notes: null,
      full_name: last.full_name, employee_code: last.employee_code,
      position_text: last.position_text, department_name: last.department_name,
    }
    setEdits(prev => ({
      ...prev,
      [pid]: { ...(prev[pid] || {}), [nextIdx]: newRow },
    }))
    pendingRef.current = {
      ...pendingRef.current,
      [pid]: { ...(pendingRef.current[pid] || {}), [nextIdx]: newRow },
    }
    triggerSave()
  }

  // ── When year/month/dept changes, reset local edits ──────────────────────
  useEffect(() => { setEdits({}); pendingRef.current = {} }, [year, month, deptId])

  // ── Export ────────────────────────────────────────────────────────────────

  async function handleExport() {
    const res = await timesheetApi.export({ year, month, ...(deptId ? { dept_id: deptId } : {}) })
    const url = URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = `cham_cong_T${String(month).padStart(2, '0')}_${year}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const S = {
    page:    { padding: '20px 24px', minHeight: '100vh', background: '#f8fafc' },
    header:  { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
    title:   { fontSize: 20, fontWeight: 800, color: '#1a2744', margin: 0, flex: 1 },
    select:  { padding: '7px 10px', borderRadius: 8, border: '1px solid #dde1e7', fontSize: 13, background: 'white' },
    btn:     { padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
    wrap:    { overflowX: 'auto', borderRadius: 10, boxShadow: '0 1px 8px #0001', background: 'white' },
    table:   { borderCollapse: 'collapse', width: '100%', fontSize: 12 },
    th:      { background: '#1a2744', color: 'white', padding: '7px 5px', textAlign: 'center',
               borderRight: '1px solid rgba(255,255,255,0.15)', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 2 },
    thFixed: { background: '#1a2744', color: 'white', padding: '7px 6px', textAlign: 'center',
               borderRight: '1px solid rgba(255,255,255,0.15)', whiteSpace: 'nowrap',
               position: 'sticky', top: 0, zIndex: 3 },
    td:      { padding: '3px 4px', borderBottom: '1px solid #eef0f3', borderRight: '1px solid #eef0f3', verticalAlign: 'middle' },
    tdSum:   { padding: '3px 6px', borderBottom: '1px solid #eef0f3', borderRight: '1px solid #eef0f3',
               background: '#e8ecf4', textAlign: 'center', fontWeight: 700, verticalAlign: 'middle' },
    inp:     { width: 32, padding: '2px 2px', border: 'none', background: 'transparent',
               textAlign: 'center', fontSize: 11, outline: 'none' },
    inpOt:   { width: 32, padding: '2px 2px', border: 'none', background: 'transparent',
               textAlign: 'center', fontSize: 11, outline: 'none', color: '#16a34a', fontWeight: 700 },
    inpText: { width: '100%', padding: '2px 4px', border: 'none', background: 'transparent',
               fontSize: 11, outline: 'none' },
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const years  = [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1]
  const days   = Array.from({ length: numDays }, (_, i) => i + 1)

  // sum header offsets
  const sumCols = ['Nghỉ phép', 'Tăng ca (h)', 'Tổng giờ', 'Ngày công', 'TC>2h', 'Ghi chú']

  return (
    <div style={S.page}>
      {/* ── Header ─────────────────────────────── */}
      <div style={S.header}>
        <h1 style={S.title}>🗓️ Chấm công</h1>

        <select style={S.select} value={month} onChange={e => setMonth(+e.target.value)}>
          {months.map(m => <option key={m} value={m}>Tháng {m}</option>)}
        </select>

        <select style={S.select} value={year} onChange={e => setYear(+e.target.value)}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <select style={S.select} value={deptId} onChange={e => setDeptId(e.target.value)}>
          <option value="">Tất cả phòng ban</option>
          {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        {saving && <span style={{ fontSize: 12, color: '#64748b' }}>Đang lưu...</span>}

        <button
          style={{ ...S.btn, background: '#1a2744', color: 'white' }}
          onClick={handleExport}
        >
          ⬇ Xuất Excel
        </button>
      </div>

      {/* ── Table ──────────────────────────────── */}
      <div style={S.wrap}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Đang tải...</div>
        ) : displayGroups.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Không có nhân viên nào.</div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.thFixed, width: 32, left: 0 }}>STT</th>
                <th style={{ ...S.thFixed, width: 130, left: 32, textAlign: 'left', paddingLeft: 8 }}>Họ và tên</th>
                <th style={{ ...S.th, width: 100 }}>CV/Bộ phận</th>
                <th style={{ ...S.th, width: 130 }}>Diễn giải CV</th>
                {days.map(d => (
                  <th key={d} style={{ ...S.th, width: 28, padding: '7px 2px' }}>{d}</th>
                ))}
                {sumCols.map(h => (
                  <th key={h} style={{ ...S.th, background: '#2d3f6b', width: h === 'Ghi chú' ? 120 : 56 }}>{h}</th>
                ))}
                <th style={{ ...S.th, width: 36, background: '#374151' }}>+</th>
              </tr>
            </thead>
            <tbody>
              {displayGroups.map(({ p, rows: baseRows }, gi) => {
                const pid = String(p.id)
                // merge DB rows with local edits
                const mergedRows = []
                const allRowIdxs = new Set([
                  ...baseRows.map(r => r.row_index),
                  ...Object.keys(edits[pid] || {}).map(Number),
                ])
                const sortedIdxs = [...allRowIdxs].sort((a, b) => a - b)
                for (const idx of sortedIdxs) {
                  const dbRow = baseRows.find(r => r.row_index === idx) || {
                    id: null, personnel_id: p.id, year, month, row_index: idx,
                    row_label: null, work_description: null, hours: {}, leave_days: 0, notes: null,
                    full_name: p.full_name, employee_code: p.employee_code,
                    position_text: p.position, department_name: p.department_name,
                  }
                  mergedRows.push(edits[pid]?.[idx] ?? dbRow)
                }

                const rowBg = gi % 2 === 1 ? '#f8fafc' : 'white'

                return mergedRows.map((row, ri) => {
                  const rowIdx = row.row_index
                  const isFirst = ri === 0
                  const { totalHours, workDays, overtimeHours, otOver2h } = calcSummary(row.hours, numDays)

                  return (
                    <tr key={`${pid}-${rowIdx}`} style={{ background: rowBg }}>
                      {/* STT */}
                      <td style={{ ...S.td, textAlign: 'center', fontWeight: 700, color: '#475569',
                                   position: 'sticky', left: 0, background: rowBg }}>
                        {isFirst ? gi + 1 : ''}
                      </td>
                      {/* Tên */}
                      <td style={{ ...S.td, position: 'sticky', left: 32, background: rowBg,
                                   fontWeight: isFirst ? 700 : 400, whiteSpace: 'nowrap', paddingLeft: 8 }}>
                        {isFirst ? (
                          <>
                            <div style={{ fontSize: 12 }}>{p.full_name}</div>
                            {p.employee_code && <div style={{ fontSize: 10, color: '#94a3b8' }}>{p.employee_code}</div>}
                          </>
                        ) : null}
                      </td>
                      {/* CV/BP */}
                      <td style={{ ...S.td, fontSize: 11, color: '#475569' }}>
                        {isFirst ? `${p.position || ''}${p.position && p.department_name ? ' / ' : ''}${p.department_name || ''}` : ''}
                      </td>
                      {/* Diễn giải */}
                      <td style={S.td}>
                        <input
                          style={S.inpText}
                          placeholder="Diễn giải..."
                          value={row.work_description || ''}
                          onChange={e => updateField(pid, rowIdx, row, 'work_description', e.target.value)}
                        />
                      </td>
                      {/* Ngày 1–N */}
                      {days.map(d => {
                        const h = parseFloat(row.hours?.[String(d)] || 0)
                        const isOt = h > 8
                        return (
                          <td key={d} style={{ ...S.td, padding: '1px', background: isOt ? '#dcfce7' : rowBg }}>
                            <input
                              type="number"
                              min={0} max={24} step={0.5}
                              style={isOt ? S.inpOt : S.inp}
                              value={h > 0 ? h : ''}
                              placeholder=""
                              onChange={e => updateHour(pid, rowIdx, row, d, e.target.value)}
                            />
                          </td>
                        )
                      })}
                      {/* Summary */}
                      <td style={S.tdSum}>
                        <input
                          type="number" min={0} max={31} step={0.5}
                          style={{ ...S.inp, width: 44, fontWeight: 700, color: '#1a2744' }}
                          value={parseFloat(row.leave_days || 0) > 0 ? parseFloat(row.leave_days) : ''}
                          onChange={e => updateField(pid, rowIdx, row, 'leave_days', parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td style={S.tdSum}>{overtimeHours > 0 ? overtimeHours.toFixed(1) : ''}</td>
                      <td style={S.tdSum}>{totalHours > 0 ? totalHours.toFixed(1) : ''}</td>
                      <td style={S.tdSum}>{workDays > 0 ? workDays : ''}</td>
                      <td style={S.tdSum}>{otOver2h > 0 ? otOver2h : ''}</td>
                      {/* Ghi chú */}
                      <td style={S.td}>
                        <input
                          style={S.inpText}
                          placeholder="Ghi chú..."
                          value={row.notes || ''}
                          onChange={e => updateField(pid, rowIdx, row, 'notes', e.target.value)}
                        />
                      </td>
                      {/* Thêm dòng (chỉ dòng cuối của nhóm) */}
                      <td style={{ ...S.td, textAlign: 'center', background: rowBg }}>
                        {ri === mergedRows.length - 1 && (
                          <button
                            onClick={() => addRow(pid, mergedRows)}
                            title="Thêm dòng công việc"
                            style={{
                              width: 22, height: 22, borderRadius: '50%',
                              border: '1.5px solid #94a3b8', background: 'white',
                              cursor: 'pointer', fontSize: 14, color: '#64748b',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              lineHeight: 1,
                            }}
                          >+</button>
                        )}
                        {row.id && ri > 0 && (
                          <button
                            onClick={() => {
                              if (window.confirm('Xoá dòng này?')) deleteMutation.mutate(row.id)
                            }}
                            title="Xoá dòng"
                            style={{
                              width: 22, height: 22, borderRadius: '50%',
                              border: '1.5px solid #fca5a5', background: 'white',
                              cursor: 'pointer', fontSize: 12, color: '#ef4444',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >×</button>
                        )}
                      </td>
                    </tr>
                  )
                })
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: '#94a3b8' }}>
        Dữ liệu tự lưu sau khi nhập • Ô màu xanh = tăng ca (&gt;8h) • TC&gt;2h = số ngày tăng ca trên 2 giờ
      </div>
    </div>
  )
}
