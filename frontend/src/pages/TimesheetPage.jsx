/**
 * TimesheetPage v3 — Bảng chấm công kiểu Excel
 * Nhập giờ trực tiếp theo ngày · Nhiều dòng/người · Auto-save
 * Model: timesheet_rows (GET/POST bulk/DELETE /timesheet)
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { timesheetApi, personnelApi, deptApi } from '../services/api'

// ─── constants ───────────────────────────────────────────────────────────────

const today = new Date()

const DIENGIAI = ['Làm việc chuyên môn', 'Việc Chính', 'Việc Phụ']

const DOW_SHORT = ['CN','T2','T3','T4','T5','T6','T7']

// ─── helpers ─────────────────────────────────────────────────────────────────

function daysInMonth(y, m) { return new Date(y, m, 0).getDate() }
function fmtYM(y, m) { return `${y}-${String(m).padStart(2,'0')}` }

function calcRow(hours = {}, numDays) {
  let total = 0, workDays = 0, ot = 0, otOver2 = 0
  for (let d = 1; d <= numDays; d++) {
    const h = parseFloat(hours[String(d)] || 0)
    if (h > 0) { workDays++; total += h; const o = Math.max(0,h-8); ot+=o; if(o>2) otOver2++ }
  }
  return { total: +total.toFixed(1), workDays, ot: +ot.toFixed(1), otOver2 }
}

// ─── main ────────────────────────────────────────────────────────────────────

export default function TimesheetPage() {
  const qc = useQueryClient()

  const [year,   setYear]   = useState(today.getFullYear())
  const [month,  setMonth]  = useState(today.getMonth() + 1)
  const [deptId, setDeptId] = useState('')
  const [search, setSearch] = useState('')
  const [selPid, setSelPid] = useState(null)
  const [tab,    setTab]    = useState('input')   // input | report
  const [saving, setSaving] = useState(false)

  const numDays = daysInMonth(year, month)
  const days    = Array.from({ length: numDays }, (_, i) => i + 1)

  // local drafts: { "pid:rowIdx": draft }
  const [drafts,  setDrafts]  = useState({})
  const [newRows, setNewRows] = useState({})  // { pid: [ ...pending new rows ] }
  const pendingRef = useRef({})
  const saveTimer  = useRef(null)

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

  // group rows by personnel_id
  const byPid = {}
  for (const r of rows) {
    const pid = String(r.personnel_id)
    if (!byPid[pid]) byPid[pid] = []
    byPid[pid].push(r)
  }

  const filteredP = allPersonnel.filter(p => {
    if (p.is_active === false) return false
    if (deptId && String(p.department_id) !== deptId) return false
    if (search && !p.full_name?.toLowerCase().includes(search.toLowerCase()) &&
        !p.employee_code?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  useEffect(() => {
    if (filteredP.length > 0 && !filteredP.find(p => String(p.id) === selPid))
      setSelPid(String(filteredP[0].id))
  }, [filteredP.length])

  useEffect(() => { setDrafts({}); setNewRows({}); pendingRef.current = {} }, [year, month, deptId])

  // ── Mutations ──────────────────────────────────────────────────────────────

  const saveMut = useMutation({
    mutationFn: (payload) => timesheetApi.bulkSave(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timesheet', year, month, deptId] })
      setNewRows({})
    },
  })

  const delMut = useMutation({
    mutationFn: (id) => timesheetApi.deleteRow(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timesheet', year, month, deptId] }),
  })

  // ── Auto-save ──────────────────────────────────────────────────────────────

  const triggerSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const batch = pendingRef.current
      if (!Object.keys(batch).length) return
      pendingRef.current = {}
      const payload = Object.values(batch)
      setSaving(true)
      try { await saveMut.mutateAsync(payload) }
      finally { setSaving(false) }
    }, 800)
  }, [saveMut])

  // ── Get merged rows for a person ───────────────────────────────────────────

  function getMergedRows(pid, person) {
    const dbRows = (byPid[pid] || []).slice().sort((a,b) => a.row_index - b.row_index)
    const extra  = newRows[pid] || []
    const allIdxs = new Set([
      ...dbRows.map(r => r.row_index),
      ...Object.keys(drafts).filter(k => k.startsWith(pid+':')).map(k => +k.split(':')[1]),
    ])
    const merged = [...allIdxs].sort((a,b)=>a-b).map(idx => {
      const base = dbRows.find(r => r.row_index === idx) || {
        id: null, personnel_id: pid, year, month, row_index: idx,
        row_label: null, work_description: idx === 0 ? 'Làm việc chuyên môn' : 'Việc Phụ',
        hours: {}, leave_days: 0, notes: null,
        full_name: person?.full_name, employee_code: person?.employee_code,
        position_text: person?.position, department_name: person?.department_name,
      }
      return drafts[`${pid}:${idx}`] ?? base
    })
    return merged.length ? merged : [{
      id: null, personnel_id: pid, year, month, row_index: 0,
      row_label: null, work_description: 'Làm việc chuyên môn',
      hours: {}, leave_days: 0, notes: null,
      full_name: person?.full_name, employee_code: person?.employee_code,
      position_text: person?.position, department_name: person?.department_name,
    }]
  }

  // ── Patch a row draft ──────────────────────────────────────────────────────

  function patchRow(pid, rowIdx, patch) {
    const key     = `${pid}:${rowIdx}`
    const person  = filteredP.find(p => String(p.id) === pid)
    const current = getMergedRows(pid, person).find(r => r.row_index === rowIdx)
    const draft   = { ...(current || {}), ...patch }
    setDrafts(prev => ({ ...prev, [key]: draft }))
    pendingRef.current = { ...pendingRef.current, [key]: draft }
    triggerSave()
  }

  function patchHour(pid, rowIdx, day, value) {
    const person  = filteredP.find(p => String(p.id) === pid)
    const current = getMergedRows(pid, person).find(r => r.row_index === rowIdx)
    const hours   = { ...(current?.hours || {}) }
    const v = parseFloat(value)
    if (isNaN(v) || v <= 0) delete hours[String(day)]
    else hours[String(day)] = v
    patchRow(pid, rowIdx, { hours })
  }

  function addRow(pid) {
    const person = filteredP.find(p => String(p.id) === pid)
    const merged = getMergedRows(pid, person)
    const nextIdx = merged.length
    const newRow  = {
      id: null, personnel_id: pid, year, month, row_index: nextIdx,
      row_label: null, work_description: nextIdx === 0 ? 'Làm việc chuyên môn' : 'Việc Phụ',
      hours: {}, leave_days: 0, notes: null,
      full_name: person?.full_name, employee_code: person?.employee_code,
      position_text: person?.position, department_name: person?.department_name,
    }
    const key = `${pid}:${nextIdx}`
    setDrafts(prev => ({ ...prev, [key]: newRow }))
    pendingRef.current = { ...pendingRef.current, [key]: newRow }
    triggerSave()
  }

  // ── Employee mini-summary ──────────────────────────────────────────────────

  function empSummary(pid) {
    const person  = filteredP.find(p => String(p.id) === pid)
    const merged  = getMergedRows(pid, person)
    const dayTotals = {}
    for (const row of merged)
      for (let d = 1; d <= numDays; d++) {
        const h = parseFloat((row.hours || {})[String(d)] || 0)
        if (h > 0) dayTotals[d] = (dayTotals[d] || 0) + h
      }
    const workDays = Object.keys(dayTotals).length
    const totalH   = Object.values(dayTotals).reduce((s,h) => s+h, 0)
    return { workDays, totalH: +totalH.toFixed(1) }
  }

  const selPerson = filteredP.find(p => String(p.id) === selPid)
  const selRows   = selPerson ? getMergedRows(String(selPerson.id), selPerson) : []

  // ── Export ─────────────────────────────────────────────────────────────────

  async function handleExport() {
    const res = await timesheetApi.export({ year, month, ...(deptId ? { dept_id: deptId } : {}) })
    const url = URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url; a.download = `cham_cong_T${String(month).padStart(2,'0')}_${year}.xlsx`
    a.click(); URL.revokeObjectURL(url)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#f1f5f9' }}>

      {/* Top bar */}
      <div style={{
        display:'flex', alignItems:'center', gap:8, padding:'8px 16px', flexWrap:'wrap',
        background:'white', borderBottom:'1px solid #e2e8f0', flexShrink:0,
      }}>
        <span style={{ fontWeight:800, fontSize:17, color:'#1a2744' }}>🗓️ Chấm công</span>

        <select style={SEL} value={month} onChange={e => setMonth(+e.target.value)}>
          {Array.from({length:12},(_,i)=>i+1).map(m =>
            <option key={m} value={m}>Tháng {m}</option>
          )}
        </select>
        <select style={SEL} value={year} onChange={e => setYear(+e.target.value)}>
          {[year-1,year,year+1].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select style={SEL} value={deptId} onChange={e => setDeptId(e.target.value)}>
          <option value="">Tất cả phòng ban</option>
          {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        {/* Tabs */}
        <div style={{ display:'flex', gap:2, marginLeft:4 }}>
          {[{k:'input',l:'📋 Nhập liệu'},{k:'report',l:'📊 Báo cáo'}].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)} style={{
              padding:'5px 12px', borderRadius:7, border:'none', cursor:'pointer',
              fontSize:12, fontWeight:600,
              background: tab===t.k ? '#1a2744' : '#f1f5f9',
              color:      tab===t.k ? 'white'   : '#475569',
            }}>{t.l}</button>
          ))}
        </div>

        {saving && <span style={{ fontSize:11, color:'#64748b' }}>Đang lưu...</span>}
        <div style={{ flex:1 }} />
        <button onClick={handleExport} style={{ ...BTN, background:'#1a2744', color:'white' }}>
          ⬇ Xuất Excel
        </button>
      </div>

      {/* Body */}
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

        {/* Left: employee list */}
        {tab === 'input' && (
          <div style={{
            width:220, flexShrink:0, background:'white', borderRight:'1px solid #e2e8f0',
            display:'flex', flexDirection:'column', overflow:'hidden',
          }}>
            <div style={{ padding:'10px 10px 4px' }}>
              <input
                placeholder="🔍 Tìm nhân viên..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width:'100%', padding:'6px 10px', borderRadius:8,
                  border:'1px solid #dde1e7', fontSize:12, boxSizing:'border-box', outline:'none',
                }}
              />
            </div>
            <div style={{ padding:'2px 10px 6px', fontSize:11, color:'#94a3b8' }}>
              {filteredP.length} nhân viên
            </div>
            <div style={{ flex:1, overflowY:'auto' }}>
              {filteredP.map(p => {
                const pid  = String(p.id)
                const act  = pid === selPid
                const summ = empSummary(pid)
                return (
                  <div key={pid} onClick={() => setSelPid(pid)} style={{
                    padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid #f1f5f9',
                    background: act ? '#eff6ff' : 'white',
                    borderLeft: act ? '3px solid #3b82f6' : '3px solid transparent',
                  }}>
                    <div style={{ fontWeight: act ? 700 : 500, fontSize:12.5, color:'#1e293b' }}>
                      {p.full_name}
                    </div>
                    {p.employee_code && (
                      <div style={{ fontSize:10, color:'#94a3b8' }}>{p.employee_code}</div>
                    )}
                    <div style={{ display:'flex', gap:4, marginTop:3 }}>
                      {summ.workDays > 0 && <Chip c="#2563eb" bg="#dbeafe">{summ.workDays}N</Chip>}
                      {summ.totalH  > 0 && <Chip c="#059669" bg="#d1fae5">{summ.totalH}h</Chip>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Right */}
        <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
          {tab === 'input' && (
            selPerson
              ? <InputGrid
                  person={selPerson}
                  rows={selRows}
                  days={days}
                  numDays={numDays}
                  year={year}
                  month={month}
                  patchHour={patchHour}
                  patchRow={patchRow}
                  addRow={addRow}
                  delMut={delMut}
                  setDrafts={setDrafts}
                />
              : <Empty text="Chọn nhân viên để nhập chấm công" />
          )}
          {tab === 'report' && (
            <ReportTab
              rows={rows}
              personnel={filteredP}
              allPersonnel={filteredP}
              days={days}
              numDays={numDays}
              year={year}
              month={month}
              isLoading={isLoading}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── InputGrid ────────────────────────────────────────────────────────────────

function InputGrid({ person, rows, days, numDays, year, month, patchHour, patchRow, addRow, delMut, setDrafts }) {
  const pid = String(person.id)

  // person-level summary (combine all rows, per day max to avoid double-counting work days)
  const dayTotals = {}
  for (const row of rows)
    for (let d = 1; d <= numDays; d++) {
      const h = parseFloat((row.hours||{})[String(d)]||0)
      if (h > 0) dayTotals[d] = (dayTotals[d]||0) + h
    }
  const totalH   = +Object.values(dayTotals).reduce((s,h)=>s+h,0).toFixed(1)
  const workDays = Object.keys(dayTotals).length
  const otH      = +Object.values(dayTotals).map(h=>Math.max(0,h-8)).reduce((s,h)=>s+h,0).toFixed(1)

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Person header */}
      <div style={{
        padding:'9px 18px', background:'#1a2744', color:'white',
        display:'flex', alignItems:'center', gap:16, flexShrink:0,
      }}>
        <div>
          <div style={{ fontWeight:800, fontSize:15 }}>{person.full_name}</div>
          <div style={{ fontSize:11, color:'#93c5fd', marginTop:1 }}>
            {[person.employee_code, person.position, person.department_name].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div style={{ flex:1 }} />
        <SChip label="Ngày công" val={workDays} unit="ngày" c="#60a5fa" />
        <SChip label="Tổng giờ"  val={totalH}   unit="giờ"  c="#34d399" />
        <SChip label="Tăng ca"   val={otH}      unit="giờ"  c="#fbbf24" />
      </div>

      {/* Table */}
      <div style={{ flex:1, overflowX:'auto', overflowY:'auto' }}>
        <table style={{ borderCollapse:'collapse', fontSize:12, minWidth:'100%' }}>
          <colgroup>
            <col style={{ width:150 }} />{/* Diễn giải */}
            <col style={{ width:130 }} />{/* CV/BP tùy chọn */}
            {days.map(d => <col key={d} style={{ width:30 }} />)}
            <col style={{ width:58 }} />{/* NP */}
            <col style={{ width:58 }} />{/* TC h */}
            <col style={{ width:62 }} />{/* Tổng h */}
            <col style={{ width:58 }} />{/* Ngày */}
            <col style={{ width:52 }} />{/* >2h */}
            <col style={{ width:120 }} />{/* Ghi chú */}
            <col style={{ width:36 }} />{/* Actions */}
          </colgroup>
          <thead>
            <tr>
              <th style={TH}>Diễn giải CV</th>
              <th style={TH}>CV / Bộ phận</th>
              {days.map(d => {
                const dow  = new Date(year,month-1,d).getDay()
                const isWk = dow===0||dow===6
                return (
                  <th key={d} style={{
                    ...TH, padding:'4px 1px',
                    background: isWk ? '#2d4a8a' : '#1a2744',
                  }}>
                    <div style={{ fontSize:10 }}>{d}</div>
                    <div style={{ fontSize:8, opacity:.7 }}>{DOW_SHORT[dow]}</div>
                  </th>
                )
              })}
              <th style={{ ...TH, background:'#2d3f6b' }}>NP</th>
              <th style={{ ...TH, background:'#2d3f6b' }}>TC (h)</th>
              <th style={{ ...TH, background:'#2d3f6b' }}>Tổng h</th>
              <th style={{ ...TH, background:'#2d3f6b' }}>Ngày</th>
              <th style={{ ...TH, background:'#2d3f6b' }}>TC&gt;2h</th>
              <th style={{ ...TH, background:'#2d3f6b' }}>Ghi chú</th>
              <th style={{ ...TH, background:'#374151' }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const { total, workDays: wd, ot, otOver2 } = calcRow(row.hours, numDays)
              const isEven = ri % 2 === 1
              const bg     = isEven ? '#f8fafc' : 'white'
              return (
                <tr key={row.row_index} style={{ background: bg }}>
                  {/* Diễn giải (work_description) */}
                  <td style={{ ...TD, background: bg }}>
                    <input
                      list={`dg-list-${pid}-${row.row_index}`}
                      value={row.work_description || ''}
                      onChange={e => patchRow(pid, row.row_index, { ...row, work_description: e.target.value })}
                      placeholder="Diễn giải..."
                      style={{ width:'100%', border:'none', background:'transparent', fontSize:12,
                               outline:'none', padding:'2px 4px' }}
                    />
                    <datalist id={`dg-list-${pid}-${row.row_index}`}>
                      {DIENGIAI.map(d => <option key={d} value={d} />)}
                    </datalist>
                  </td>
                  {/* CV/BP (row_label) */}
                  <td style={{ ...TD, background: bg }}>
                    <input
                      value={row.row_label || ''}
                      onChange={e => patchRow(pid, row.row_index, { ...row, row_label: e.target.value || null })}
                      placeholder={ri === 0
                        ? [person.position, person.department_name].filter(Boolean).join(' / ') || 'Bộ phận...'
                        : 'Máy / Vị trí...'}
                      style={{ width:'100%', border:'none', background:'transparent', fontSize:11,
                               outline:'none', padding:'2px 4px', color: row.row_label ? '#1e293b' : '#94a3b8' }}
                    />
                  </td>
                  {/* Day cells */}
                  {days.map(d => {
                    const h   = parseFloat((row.hours||{})[String(d)]||0)
                    const isOt = h > 8
                    const dow  = new Date(year,month-1,d).getDay()
                    const isWk = dow===0||dow===6
                    return (
                      <td key={d} style={{
                        ...TD, padding:'1px', textAlign:'center',
                        background: isOt ? '#dcfce7' : isWk ? '#fffbeb' : bg,
                      }}>
                        <input
                          type="number" min={0} max={24} step={0.5}
                          value={h > 0 ? h : ''}
                          onChange={e => patchHour(pid, row.row_index, d, e.target.value)}
                          style={{
                            width:28, border:'none', background:'transparent',
                            textAlign:'center', fontSize:11, outline:'none', padding:0,
                            color: isOt ? '#16a34a' : '#1e293b', fontWeight: isOt ? 700 : 400,
                          }}
                        />
                      </td>
                    )
                  })}
                  {/* Summary */}
                  <td style={SUM}>
                    <input
                      type="number" min={0} step={0.5}
                      value={parseFloat(row.leave_days||0) > 0 ? row.leave_days : ''}
                      onChange={e => patchRow(pid, row.row_index, { ...row, leave_days: parseFloat(e.target.value)||0 })}
                      style={{ width:46, border:'none', background:'transparent', textAlign:'center',
                               fontSize:11, outline:'none', fontWeight:700 }}
                    />
                  </td>
                  <td style={SUM}>{ot > 0 ? ot : ''}</td>
                  <td style={{ ...SUM, color: total > 0 ? '#16a34a' : '#94a3b8', fontWeight:700 }}>
                    {total > 0 ? total : ''}
                  </td>
                  <td style={SUM}>{wd > 0 ? wd : ''}</td>
                  <td style={SUM}>{otOver2 > 0 ? otOver2 : ''}</td>
                  {/* Notes */}
                  <td style={{ ...TD, background: bg }}>
                    <input
                      value={row.notes||''}
                      onChange={e => patchRow(pid, row.row_index, { ...row, notes: e.target.value||null })}
                      placeholder="Ghi chú..."
                      style={{ width:'100%', border:'none', background:'transparent', fontSize:11,
                               outline:'none', padding:'2px 4px' }}
                    />
                  </td>
                  {/* Actions */}
                  <td style={{ ...TD, textAlign:'center', background: bg }}>
                    <div style={{ display:'flex', flexDirection:'column', gap:2, alignItems:'center' }}>
                      {ri === rows.length - 1 && (
                        <button onClick={() => addRow(pid)} title="Thêm dòng"
                          style={ICOBTN('#94a3b8')}>+</button>
                      )}
                      {row.id && (
                        <button
                          onClick={() => {
                            if (!window.confirm('Xoá dòng này?')) return
                            delMut.mutate(row.id)
                            setDrafts(prev => {
                              const n = {...prev}
                              delete n[`${pid}:${row.row_index}`]
                              return n
                            })
                          }}
                          title="Xoá" style={ICOBTN('#ef4444')}>×</button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ padding:'5px 14px', fontSize:10, color:'#94a3b8', background:'white',
                    borderTop:'1px solid #f1f5f9', flexShrink:0 }}>
        Tự lưu sau khi nhập · Ô xanh = tăng ca (&gt;8h) · Nền vàng = cuối tuần · + thêm dòng Việc Phụ
      </div>
    </div>
  )
}

// ─── ReportTab ────────────────────────────────────────────────────────────────

function ReportTab({ rows, personnel, days, numDays, year, month, isLoading }) {
  if (isLoading) return <Empty text="Đang tải..." />
  if (!rows.length && !personnel.length) return <Empty text="Không có dữ liệu" />

  // Build map: pid → { day → totalHours (summed across all rows) }
  const pidDayMap = {}
  const pidSummary = {}
  for (const r of rows) {
    const pid = String(r.personnel_id)
    if (!pidDayMap[pid]) pidDayMap[pid] = {}
    for (let d = 1; d <= numDays; d++) {
      const h = parseFloat((r.hours||{})[String(d)]||0)
      if (h > 0) pidDayMap[pid][d] = (pidDayMap[pid][d]||0) + h
    }
    // leave days: take from row_index 0 only
    if (r.row_index === 0) {
      pidSummary[pid] = pidSummary[pid] || { leave: 0 }
      pidSummary[pid].leave += parseFloat(r.leave_days||0)
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{
        padding:'8px 16px', background:'white', borderBottom:'1px solid #e2e8f0',
        fontSize:13, fontWeight:700, color:'#1a2744', flexShrink:0,
      }}>
        Báo cáo tháng {month}/{year} — {personnel.length} nhân viên
      </div>
      <div style={{ flex:1, overflow:'auto' }}>
        <table style={{ borderCollapse:'collapse', fontSize:11, minWidth:'100%' }}>
          <thead>
            <tr>
              <th style={{ ...TH, width:32, position:'sticky', left:0, zIndex:4 }}>STT</th>
              <th style={{ ...TH, width:150, position:'sticky', left:32, zIndex:4,
                            textAlign:'left', paddingLeft:8 }}>Họ và tên</th>
              <th style={{ ...TH, width:90, position:'sticky', left:182, zIndex:4 }}>Bộ phận</th>
              {days.map(d => {
                const dow = new Date(year,month-1,d).getDay()
                const isW = dow===0||dow===6
                return (
                  <th key={d} style={{ ...TH, width:30, padding:'4px 1px',
                                       background: isW ? '#2d4a8a' : '#1a2744' }}>
                    <div style={{ fontSize:10 }}>{d}</div>
                    <div style={{ fontSize:8, opacity:.7 }}>{DOW_SHORT[dow]}</div>
                  </th>
                )
              })}
              {['Ngày','Tổng h','TC (h)','NP'].map(h => (
                <th key={h} style={{ ...TH, width:54, background:'#2d3f6b' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {personnel.map((p, gi) => {
              const pid  = String(p.id)
              const dmap = pidDayMap[pid] || {}
              const bg   = gi%2===1 ? '#f8fafc' : 'white'

              const totalH   = +Object.values(dmap).reduce((s,h)=>s+h,0).toFixed(1)
              const workDays = Object.keys(dmap).length
              const otH      = +Object.values(dmap).map(h=>Math.max(0,h-8)).reduce((s,h)=>s+h,0).toFixed(1)
              const leave    = pidSummary[pid]?.leave || 0

              return (
                <tr key={pid} style={{ background: bg }}>
                  <td style={{ ...TD, textAlign:'center', fontWeight:700, color:'#64748b',
                                position:'sticky', left:0, background:bg }}>{gi+1}</td>
                  <td style={{ ...TD, position:'sticky', left:32, background:bg,
                                fontWeight:700, paddingLeft:8, whiteSpace:'nowrap' }}>
                    {p.full_name}
                    {p.employee_code && (
                      <div style={{ fontSize:9, color:'#94a3b8', fontWeight:400 }}>{p.employee_code}</div>
                    )}
                  </td>
                  <td style={{ ...TD, position:'sticky', left:182, background:bg,
                                fontSize:10, color:'#64748b', maxWidth:90, overflow:'hidden',
                                textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {p.department_name || ''}
                  </td>
                  {days.map(d => {
                    const h   = dmap[d]
                    const dow = new Date(year,month-1,d).getDay()
                    const isW = dow===0||dow===6
                    return (
                      <td key={d} style={{
                        ...TD, textAlign:'center', width:30,
                        background: h > 8 ? '#dcfce7' : isW ? '#fffbeb' : bg,
                        color: h > 8 ? '#16a34a' : '#1e293b',
                        fontWeight: h > 8 ? 700 : 400, fontSize:10,
                      }}>
                        {h || ''}
                      </td>
                    )
                  })}
                  <td style={{ ...TD, textAlign:'center', background:'#e8ecf4', fontWeight:700 }}>{workDays||''}</td>
                  <td style={{ ...TD, textAlign:'center', background:'#e8ecf4', fontWeight:700,
                                color: totalH > 0 ? '#16a34a' : '#1e293b' }}>{totalH||''}</td>
                  <td style={{ ...TD, textAlign:'center', background:'#e8ecf4', fontWeight:700,
                                color: otH > 0 ? '#d97706' : '#1e293b' }}>{otH||''}</td>
                  <td style={{ ...TD, textAlign:'center', background:'#e8ecf4', fontWeight:700 }}>{leave||''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Micro ────────────────────────────────────────────────────────────────────

function Empty({ text }) {
  return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8' }}>
      {text}
    </div>
  )
}

function Chip({ c, bg, children }) {
  return (
    <span style={{ display:'inline-block', padding:'1px 5px', borderRadius:4,
                   fontSize:10, fontWeight:700, color:c, background:bg }}>
      {children}
    </span>
  )
}

function SChip({ label, val, unit, c }) {
  return (
    <div style={{ textAlign:'center', minWidth:50 }}>
      <div style={{ fontSize:15, fontWeight:800, color:c }}>{val||0}</div>
      <div style={{ fontSize:9, color:'rgba(255,255,255,0.55)', lineHeight:1.2 }}>{label}<br/>{unit}</div>
    </div>
  )
}

function ICOBTN(color) {
  return {
    width:20, height:20, borderRadius:'50%', border:`1.5px solid ${color}20`,
    background:'white', cursor:'pointer', fontSize:13, color,
    display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1,
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const SEL = {
  padding:'6px 10px', borderRadius:8, border:'1px solid #dde1e7',
  fontSize:12, background:'white', outline:'none',
}

const BTN = {
  padding:'7px 14px', borderRadius:8, border:'none', cursor:'pointer',
  fontSize:12, fontWeight:600,
}

const TH = {
  background:'#1a2744', color:'white', padding:'6px 4px', textAlign:'center',
  borderRight:'1px solid rgba(255,255,255,0.12)', whiteSpace:'nowrap',
  position:'sticky', top:0, zIndex:2, fontSize:11,
}

const TD = {
  padding:'3px 4px', borderBottom:'1px solid #eef0f3', borderRight:'1px solid #eef0f3',
  verticalAlign:'middle',
}

const SUM = {
  ...TD,
  background:'#e8ecf4', textAlign:'center', fontWeight:700, color:'#1a2744',
}
