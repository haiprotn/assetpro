import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { timesheetApi, personnelApi, deptApi } from '../services/api'

// ─── helpers ────────────────────────────────────────────────────────────────

const today = new Date()

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

function calcSummary(rows = [], numDays) {
  let totalHours = 0, workDays = 0, overtimeHours = 0, otOver2h = 0, leaveDays = 0
  const daySet = new Set()
  for (const row of rows) {
    leaveDays += parseFloat(row.leave_days || 0)
    for (let d = 1; d <= numDays; d++) {
      const h = parseFloat((row.hours || {})[String(d)] || 0)
      if (h > 0) {
        daySet.add(d)
        totalHours += h
        const ot = Math.max(0, h - 8)
        overtimeHours += ot
        if (ot > 2) otOver2h++
      }
    }
  }
  workDays = daySet.size
  return { totalHours, workDays, overtimeHours: +overtimeHours.toFixed(1), otOver2h, leaveDays }
}

// ─── main ────────────────────────────────────────────────────────────────────

export default function TimesheetPage() {
  const qc = useQueryClient()

  const [year,     setYear]     = useState(today.getFullYear())
  const [month,    setMonth]    = useState(today.getMonth() + 1)
  const [deptId,   setDeptId]   = useState('')
  const [search,   setSearch]   = useState('')
  const [selPid,   setSelPid]   = useState(null)   // selected personnel id
  const [saving,   setSaving]   = useState(false)

  const numDays = daysInMonth(year, month)

  // Local drafts — { pid: { rowIdx: rowDraft } }
  const [edits,    setEdits]    = useState({})
  const pendingRef               = useRef({})
  const saveTimeout              = useRef(null)

  // ── Queries ────────────────────────────────────────────────────────────────

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

  // ── Group DB rows by pid ───────────────────────────────────────────────────

  const byPid = {}
  for (const r of rows) {
    const pid = String(r.personnel_id)
    if (!byPid[pid]) byPid[pid] = []
    byPid[pid].push(r)
  }

  const filteredPersonnel = allPersonnel.filter(p => {
    if (p.is_active === false) return false
    if (deptId && String(p.department_id) !== deptId) return false
    if (search && !p.full_name?.toLowerCase().includes(search.toLowerCase()) &&
        !p.employee_code?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // auto-select first when list changes
  useEffect(() => {
    if (filteredPersonnel.length > 0 && !selPid) {
      setSelPid(String(filteredPersonnel[0].id))
    }
  }, [filteredPersonnel.length])

  // reset edits on month/year/dept change
  useEffect(() => { setEdits({}); pendingRef.current = {} }, [year, month, deptId])

  // ── Mutations ──────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: (payload) => timesheetApi.bulkSave(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timesheet', year, month, deptId] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => timesheetApi.deleteRow(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timesheet', year, month, deptId] }),
  })

  // ── Auto-save debounce ─────────────────────────────────────────────────────

  const triggerSave = useCallback(() => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(async () => {
      const toSave = pendingRef.current
      if (!Object.keys(toSave).length) return
      pendingRef.current = {}
      const payload = []
      for (const pid of Object.keys(toSave))
        for (const idx of Object.keys(toSave[pid]))
          payload.push(toSave[pid][idx])
      if (payload.length) {
        setSaving(true)
        try { await saveMutation.mutateAsync(payload) }
        finally { setSaving(false) }
      }
    }, 1000)
  }, [saveMutation])

  // ── Edit helpers ───────────────────────────────────────────────────────────

  function getDraft(pid, rowIdx, baseRow) {
    return edits[pid]?.[rowIdx] ?? baseRow
  }

  function patchDraft(pid, rowIdx, baseRow, patch) {
    const draft = { ...getDraft(pid, rowIdx, baseRow), ...patch }
    setEdits(prev => ({ ...prev, [pid]: { ...(prev[pid] || {}), [rowIdx]: draft } }))
    pendingRef.current = {
      ...pendingRef.current,
      [pid]: { ...(pendingRef.current[pid] || {}), [rowIdx]: draft },
    }
    triggerSave()
  }

  function setHour(pid, rowIdx, baseRow, day, value) {
    const draft = getDraft(pid, rowIdx, baseRow)
    const hours = { ...(draft.hours || {}) }
    const v = parseFloat(value)
    if (isNaN(v) || v <= 0) delete hours[String(day)]
    else hours[String(day)] = v
    patchDraft(pid, rowIdx, baseRow, { hours })
  }

  function addRow(pid, mergedRows) {
    const nextIdx = mergedRows.length
    const ref = mergedRows[mergedRows.length - 1]
    const newRow = {
      id: null, personnel_id: pid, year, month, row_index: nextIdx,
      row_label: null, work_description: null, hours: {}, leave_days: 0, notes: null,
      full_name: ref.full_name, employee_code: ref.employee_code,
      position_text: ref.position_text, department_name: ref.department_name,
    }
    setEdits(prev => ({ ...prev, [pid]: { ...(prev[pid] || {}), [nextIdx]: newRow } }))
    pendingRef.current = {
      ...pendingRef.current,
      [pid]: { ...(pendingRef.current[pid] || {}), [nextIdx]: newRow },
    }
    triggerSave()
  }

  // ── Selected person data ───────────────────────────────────────────────────

  const selPerson = filteredPersonnel.find(p => String(p.id) === selPid)

  function getMergedRows(pid, p) {
    const dbRows = byPid[pid] || []
    const allIdxs = new Set([
      ...dbRows.map(r => r.row_index),
      ...Object.keys(edits[pid] || {}).map(Number),
    ])
    const sorted = [...allIdxs].sort((a, b) => a - b)
    if (!sorted.length) sorted.push(0)
    return sorted.map(idx => {
      const dbRow = dbRows.find(r => r.row_index === idx) || {
        id: null, personnel_id: p?.id || pid, year, month, row_index: idx,
        row_label: null, work_description: null, hours: {}, leave_days: 0, notes: null,
        full_name: p?.full_name, employee_code: p?.employee_code,
        position_text: p?.position, department_name: p?.department_name,
      }
      return edits[pid]?.[idx] ?? dbRow
    })
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  async function handleExport() {
    const res = await timesheetApi.export({ year, month, ...(deptId ? { dept_id: deptId } : {}) })
    const url = URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = `cham_cong_T${String(month).padStart(2, '0')}_${year}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Constants ──────────────────────────────────────────────────────────────

  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const years  = [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1]
  const days   = Array.from({ length: numDays }, (_, i) => i + 1)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f1f5f9' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px',
        background: 'white', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', flexShrink: 0,
      }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: '#1a2744', marginRight: 4 }}>🗓️ Chấm công</span>

        <select style={sel} value={month} onChange={e => setMonth(+e.target.value)}>
          {months.map(m => <option key={m} value={m}>Tháng {m}</option>)}
        </select>

        <select style={sel} value={year} onChange={e => setYear(+e.target.value)}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <select style={sel} value={deptId} onChange={e => setDeptId(e.target.value)}>
          <option value="">Tất cả phòng ban</option>
          {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        {saving && <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>Đang lưu...</span>}

        <div style={{ flex: 1 }} />

        <button
          onClick={handleExport}
          style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                   background: '#1a2744', color: 'white', fontSize: 13, fontWeight: 600 }}
        >⬇ Xuất Excel</button>
      </div>

      {/* ── Body: left list + right grid ────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Left: employee list ───────────────────────────────────────── */}
        <div style={{
          width: 230, flexShrink: 0, background: 'white', borderRight: '1px solid #e2e8f0',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Search */}
          <div style={{ padding: '10px 10px 6px' }}>
            <input
              placeholder="🔍 Tìm nhân viên..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '6px 10px', borderRadius: 8,
                border: '1px solid #dde1e7', fontSize: 12, boxSizing: 'border-box', outline: 'none',
              }}
            />
          </div>
          <div style={{ padding: '2px 10px 6px', fontSize: 11, color: '#94a3b8' }}>
            {filteredPersonnel.length} nhân viên
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {isLoading ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Đang tải...</div>
            ) : filteredPersonnel.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Không có nhân viên</div>
            ) : filteredPersonnel.map(p => {
              const pid = String(p.id)
              const mergedRows = getMergedRows(pid, p)
              const summ = calcSummary(mergedRows, numDays)
              const isActive = pid === selPid
              return (
                <div
                  key={pid}
                  onClick={() => setSelPid(pid)}
                  style={{
                    padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                    background: isActive ? '#eff6ff' : 'white',
                    borderLeft: isActive ? '3px solid #3b82f6' : '3px solid transparent',
                    transition: 'background 0.1s',
                  }}
                >
                  <div style={{ fontWeight: isActive ? 700 : 500, fontSize: 12.5, color: '#1e293b' }}>
                    {p.full_name}
                  </div>
                  {p.employee_code && (
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{p.employee_code}</div>
                  )}
                  {/* Mini summary badges */}
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    {summ.workDays > 0 && (
                      <Badge color="#2563eb" bg="#dbeafe">{summ.workDays}N</Badge>
                    )}
                    {summ.totalHours > 0 && (
                      <Badge color="#059669" bg="#d1fae5">{summ.totalHours.toFixed(0)}h</Badge>
                    )}
                    {summ.overtimeHours > 0 && (
                      <Badge color="#d97706" bg="#fef3c7">TC {summ.overtimeHours}h</Badge>
                    )}
                    {summ.leaveDays > 0 && (
                      <Badge color="#dc2626" bg="#fee2e2">NP {summ.leaveDays}</Badge>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Right: grid for selected person ──────────────────────────── */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {!selPerson ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
              Chọn nhân viên để nhập chấm công
            </div>
          ) : (
            <PersonGrid
              person={selPerson}
              pid={String(selPerson.id)}
              mergedRows={getMergedRows(String(selPerson.id), selPerson)}
              numDays={numDays}
              days={days}
              year={year}
              month={month}
              onHour={(rowIdx, baseRow, d, v) => setHour(String(selPerson.id), rowIdx, baseRow, d, v)}
              onField={(rowIdx, baseRow, field, v) => patchDraft(String(selPerson.id), rowIdx, baseRow, { [field]: v })}
              onAddRow={(mergedRows) => addRow(String(selPerson.id), mergedRows)}
              onDeleteRow={(id) => { if (window.confirm('Xoá dòng này?')) deleteMutation.mutate(id) }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── PersonGrid: grid nhập giờ cho 1 nhân viên ──────────────────────────────

function PersonGrid({ person, pid, mergedRows, numDays, days, year, month, onHour, onField, onAddRow, onDeleteRow }) {
  const summ = calcSummary(mergedRows, numDays)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Person header */}
      <div style={{
        padding: '10px 18px', background: '#1a2744', color: 'white',
        display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{person.full_name}</div>
          <div style={{ fontSize: 11, color: '#93c5fd', marginTop: 2 }}>
            {person.employee_code && `${person.employee_code} · `}
            {person.position && `${person.position}`}
            {person.position && person.department_name ? ' / ' : ''}
            {person.department_name}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {/* Summary chips */}
        <SummChip label="Ngày công" value={summ.workDays} unit="ngày" color="#60a5fa" />
        <SummChip label="Tổng giờ" value={summ.totalHours.toFixed(1)} unit="giờ" color="#34d399" />
        <SummChip label="Tăng ca" value={summ.overtimeHours} unit="giờ" color="#fbbf24" />
        <SummChip label="TC>2h" value={summ.otOver2h} unit="ngày" color="#f87171" />
        <SummChip label="Nghỉ phép" value={summ.leaveDays} unit="ngày" color="#c084fc" />
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '100%', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={TH({ w: 130, left: 0, sticky: true })}>Diễn giải công việc</th>
              {days.map(d => {
                const dow = new Date(year, month - 1, d).getDay()
                const isWeekend = dow === 0 || dow === 6
                return (
                  <th key={d} style={{
                    ...TH({ w: 34 }),
                    background: isWeekend ? '#2d4a8a' : '#1a2744',
                    color: isWeekend ? '#fde68a' : 'white',
                  }}>
                    <div>{d}</div>
                    <div style={{ fontSize: 9, opacity: 0.7 }}>{['CN','T2','T3','T4','T5','T6','T7'][dow]}</div>
                  </th>
                )
              })}
              <th style={TH({ w: 64, bg: '#2d3f6b' })}>Nghỉ phép</th>
              <th style={TH({ w: 64, bg: '#2d3f6b' })}>Tăng ca (h)</th>
              <th style={TH({ w: 64, bg: '#2d3f6b' })}>Tổng giờ</th>
              <th style={TH({ w: 60, bg: '#2d3f6b' })}>Ngày công</th>
              <th style={TH({ w: 52, bg: '#2d3f6b' })}>TC&gt;2h</th>
              <th style={TH({ w: 120, bg: '#2d3f6b' })}>Ghi chú</th>
              <th style={TH({ w: 36, bg: '#374151' })}></th>
            </tr>
          </thead>
          <tbody>
            {mergedRows.map((row, ri) => {
              const rowIdx = row.row_index
              const { totalHours, workDays, overtimeHours, otOver2h } = calcSummary([row], numDays)
              const isExtra = ri > 0

              return (
                <tr key={rowIdx} style={{ background: isExtra ? '#f8fafc' : 'white' }}>
                  {/* Diễn giải */}
                  <td style={{ ...TD, position: 'sticky', left: 0, background: isExtra ? '#f8fafc' : 'white',
                                minWidth: 130, maxWidth: 130 }}>
                    <input
                      style={{ width: '100%', border: 'none', background: 'transparent',
                               fontSize: 12, outline: 'none', padding: '2px 4px' }}
                      placeholder={isExtra ? 'Công việc phụ...' : 'Diễn giải...'}
                      value={row.work_description || ''}
                      onChange={e => onField(rowIdx, row, 'work_description', e.target.value)}
                    />
                  </td>

                  {/* Days */}
                  {days.map(d => {
                    const h = parseFloat((row.hours || {})[String(d)] || 0)
                    const isOt = h > 8
                    const dow = new Date(year, month - 1, d).getDay()
                    const isWeekend = dow === 0 || dow === 6
                    return (
                      <td key={d} style={{
                        ...TD, padding: '1px',
                        background: isOt ? '#dcfce7' : isWeekend ? '#fef9f0' : 'inherit',
                      }}>
                        <input
                          type="number" min={0} max={24} step={0.5}
                          value={h > 0 ? h : ''}
                          onChange={e => onHour(rowIdx, row, d, e.target.value)}
                          style={{
                            width: 32, border: 'none', background: 'transparent',
                            textAlign: 'center', fontSize: 12, outline: 'none',
                            color: isOt ? '#16a34a' : '#1e293b', fontWeight: isOt ? 700 : 400,
                          }}
                        />
                      </td>
                    )
                  })}

                  {/* Summary */}
                  <td style={{ ...TD, background: '#e8ecf4', textAlign: 'center', minWidth: 64 }}>
                    <input
                      type="number" min={0} max={31} step={0.5}
                      value={parseFloat(row.leave_days || 0) > 0 ? parseFloat(row.leave_days) : ''}
                      onChange={e => onField(rowIdx, row, 'leave_days', parseFloat(e.target.value) || 0)}
                      style={{ width: 48, border: 'none', background: 'transparent',
                               textAlign: 'center', fontSize: 12, outline: 'none', fontWeight: 700 }}
                    />
                  </td>
                  <td style={TDSM}>{overtimeHours > 0 ? overtimeHours.toFixed(1) : ''}</td>
                  <td style={TDSM}>{totalHours > 0 ? totalHours.toFixed(1) : ''}</td>
                  <td style={TDSM}>{workDays > 0 ? workDays : ''}</td>
                  <td style={TDSM}>{otOver2h > 0 ? otOver2h : ''}</td>
                  <td style={{ ...TD, minWidth: 120 }}>
                    <input
                      style={{ width: '100%', border: 'none', background: 'transparent',
                               fontSize: 12, outline: 'none', padding: '2px 4px' }}
                      placeholder="Ghi chú..."
                      value={row.notes || ''}
                      onChange={e => onField(rowIdx, row, 'notes', e.target.value)}
                    />
                  </td>
                  {/* Actions */}
                  <td style={{ ...TD, textAlign: 'center', minWidth: 36 }}>
                    {ri === mergedRows.length - 1 && (
                      <button
                        onClick={() => onAddRow(mergedRows)}
                        title="Thêm dòng"
                        style={{
                          width: 22, height: 22, borderRadius: '50%',
                          border: '1.5px solid #94a3b8', background: 'white',
                          cursor: 'pointer', fontSize: 14, color: '#64748b', lineHeight: '20px',
                        }}
                      >+</button>
                    )}
                    {row.id && isExtra && (
                      <button
                        onClick={() => onDeleteRow(row.id)}
                        title="Xoá dòng"
                        style={{
                          width: 22, height: 22, borderRadius: '50%',
                          border: '1.5px solid #fca5a5', background: 'white',
                          cursor: 'pointer', fontSize: 13, color: '#ef4444', lineHeight: '20px',
                        }}
                      >×</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ padding: '6px 16px', fontSize: 10, color: '#94a3b8', background: 'white',
                    borderTop: '1px solid #f1f5f9', flexShrink: 0 }}>
        Tự lưu sau khi nhập · Ô xanh = tăng ca (&gt;8h) · Nền vàng nhạt = cuối tuần · + để thêm dòng công việc
      </div>
    </div>
  )
}

// ─── small helpers ───────────────────────────────────────────────────────────

function Badge({ color, bg, children }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 5px', borderRadius: 4,
      fontSize: 10, fontWeight: 700, color, background: bg,
    }}>{children}</span>
  )
}

function SummChip({ label, value, unit, color }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 52 }}>
      <div style={{ fontSize: 16, fontWeight: 800, color }}>{value || 0}</div>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', lineHeight: 1.2 }}>{label}<br />{unit}</div>
    </div>
  )
}

const sel = {
  padding: '6px 10px', borderRadius: 8, border: '1px solid #dde1e7',
  fontSize: 13, background: 'white', outline: 'none',
}

function TH({ w, left, sticky, bg, }) {
  return {
    background: bg || '#1a2744', color: 'white',
    padding: '6px 4px', textAlign: 'center',
    borderRight: '1px solid rgba(255,255,255,0.12)',
    whiteSpace: 'nowrap', position: sticky ? 'sticky' : 'sticky',
    top: 0, left: sticky ? (left ?? 0) : undefined,
    zIndex: sticky ? 3 : 2,
    minWidth: w, maxWidth: w, width: w,
    fontSize: 11,
  }
}

const TD = {
  padding: '3px 4px',
  borderBottom: '1px solid #eef0f3',
  borderRight: '1px solid #eef0f3',
  verticalAlign: 'middle',
}

const TDSM = {
  ...TD,
  background: '#e8ecf4',
  textAlign: 'center',
  fontWeight: 700,
  color: '#1a2744',
}
