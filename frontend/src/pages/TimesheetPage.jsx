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
  const [saving,     setSaving]     = useState(false)
  const [saveStatus, setSaveStatus] = useState('idle') // idle | saving | saved
  const [dirty,      setDirty]      = useState(false)  // có thay đổi chưa lưu
  const [toast,      setToast]      = useState(null)   // thông báo nổi

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
      setDirty(false)
      setSaveStatus('saved')
      showToast('✓ Đã lưu thành công!')
      setTimeout(() => setSaveStatus('idle'), 2500)
    },
    onError: (err) => {
      setSaveStatus('idle')
      showToast('❌ Lỗi lưu: ' + (err?.response?.data?.detail || err?.message || 'Lỗi không xác định'))
    },
  })

  const delMut = useMutation({
    mutationFn: (id) => timesheetApi.deleteRow(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['timesheet', year, month, deptId] }),
  })

  // ── Auto-save ──────────────────────────────────────────────────────────────

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // Không auto-save — chỉ đánh dấu dirty, chờ user bấm Lưu
  const triggerSave = useCallback(() => {
    setDirty(true)
  }, [])

  async function flushSave() {
    const batch = pendingRef.current
    if (!Object.keys(batch).length) {
      showToast('Không có thay đổi mới để lưu')
      return
    }
    pendingRef.current = {}
    const payload = Object.values(batch)
    setSaving(true); setSaveStatus('saving')
    try { await saveMut.mutateAsync(payload) }
    finally { setSaving(false) }
  }

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
                  saving={saving}
                  saveStatus={saveStatus}
                  dirty={dirty}
                  flushSave={flushSave}
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

      {/* Toast notification */}
      {toast && (
        <div style={{
          position:'fixed', bottom:28, left:'50%', transform:'translateX(-50%)',
          background: toast.startsWith('✓') ? '#16a34a' : toast.startsWith('❌') ? '#dc2626' : '#1a2744',
          color:'white', padding:'11px 28px', borderRadius:12, zIndex:9999,
          fontSize:14, fontWeight:700, boxShadow:'0 6px 24px rgba(0,0,0,.3)',
          pointerEvents:'none', whiteSpace:'nowrap',
        }}>{toast}</div>
      )}
    </div>
  )
}

// ─── InputGrid (vertical: rows=days, cols=work-types) ────────────────────────

function InputGrid({ person, rows, days, numDays, year, month, patchHour, patchRow, addRow, delMut, setDrafts, saving, saveStatus, dirty, flushSave }) {
  const pid = String(person.id)
  const [editCol, setEditCol] = useState(null)

  // ── Sessions (S=sáng 4h, C=chiều 4h) persisted in localStorage ───────────
  const sessKey = `ts_sess_${pid}_${year}_${month}`
  const [sessions, setSessions] = useState({})

  useEffect(() => {
    const stored = localStorage.getItem(sessKey)
    if (stored) { try { setSessions(JSON.parse(stored)); return } catch {} }
    // Init from existing hours
    const init = {}
    for (let d = 1; d <= numDays; d++) {
      const tot = rows.reduce((s,r) => s + parseFloat((r.hours||{})[String(d)]||0), 0)
      if (tot >= 8) init[d] = {s:true,c:true}
      else if (tot > 0) init[d] = {s:true,c:false}
    }
    setSessions(init)
  }, [sessKey])

  useEffect(() => {
    if (Object.keys(sessions).length) localStorage.setItem(sessKey, JSON.stringify(sessions))
  }, [sessions, sessKey])

  const sessAvail = d => { const s=sessions[d]||{}; return (s.s?4:0)+(s.c?4:0) }

  function toggleSession(day, field) {
    const curr = sessions[day]||{s:false,c:false}
    const sess = {...curr, [field]: !curr[field]}
    setSessions(p => ({...p, [day]: sess}))
    const avail = (sess.s?4:0)+(sess.c?4:0)
    const subTotal = rows.filter(r=>r.row_index>0).reduce((s,r)=>s+parseFloat((r.hours||{})[String(day)]||0),0)
    const main = Math.max(0, avail - subTotal)
    patchHour(pid, 0, day, main > 0 ? String(main) : '')
    // dirty flag set by triggerSave inside patchHour
  }

  function handleSubChange(subIdx, day, value) {
    patchHour(pid, subIdx, day, value)
    const avail = sessAvail(day)
    if (!avail) return
    const newSub = parseFloat(value)||0
    const otherSub = rows.filter(r=>r.row_index>0&&r.row_index!==subIdx)
                         .reduce((s,r)=>s+parseFloat((r.hours||{})[String(day)]||0),0)
    const main = Math.max(0, avail - otherSub - newSub)
    patchHour(pid, 0, day, main > 0 ? String(main) : '')
  }

  function fillWeekdays() {
    const newSess = {...sessions}
    const mRow = rows.find(r=>r.row_index===0)
    const newH  = {...(mRow?.hours||{})}
    for (let d = 1; d <= numDays; d++) {
      const dow = new Date(year,month-1,d).getDay()
      if (dow===0||dow===6) continue
      newSess[d] = {s:true,c:true}
      const sub = rows.filter(r=>r.row_index>0).reduce((s,r)=>s+parseFloat((r.hours||{})[String(d)]||0),0)
      const h = Math.max(0, 8-sub)
      if (h > 0) newH[String(d)] = h; else delete newH[String(d)]
    }
    setSessions(newSess)
    if (mRow) patchRow(pid, 0, {...mRow, hours: newH})
  }

  // ── Summaries ─────────────────────────────────────────────────────────────
  const dayTotals = {}
  for (const row of rows) for (let d=1;d<=numDays;d++) {
    const h = parseFloat((row.hours||{})[String(d)]||0)
    if (h>0) dayTotals[d] = (dayTotals[d]||0)+h
  }
  const totalH   = +Object.values(dayTotals).reduce((s,h)=>s+h,0).toFixed(1)
  const workDays = Object.values(dayTotals).filter(h=>h>0).length
  const otH      = +Object.values(dayTotals).map(h=>Math.max(0,h-8)).reduce((s,h)=>s+h,0).toFixed(1)

  const mainRow = rows.find(r=>r.row_index===0)||null
  const subRows = rows.filter(r=>r.row_index>0)

  // Per-day notes stored as JSON in mainRow.notes  e.g. {"1":"ghi chú","3":"..."}
  const dayNotes = (() => {
    try { const p = JSON.parse(mainRow?.notes||'{}'); return typeof p==='object' ? p : {} }
    catch { return {} }
  })()

  function setDayNote(day, note) {
    const next = { ...dayNotes }
    if (note?.trim()) next[String(day)] = note.trim()
    else delete next[String(day)]
    const base = mainRow || {
      id:null, personnel_id:pid, year, month, row_index:0,
      row_label:null, work_description:'Làm việc chuyên môn',
      hours:{}, leave_days:0, notes:null,
    }
    patchRow(pid, 0, { ...base, notes: Object.keys(next).length ? JSON.stringify(next) : null })
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>

      {/* Person header */}
      <div style={{
        padding:'10px 18px', background:'#1a2744', color:'white',
        display:'flex', alignItems:'center', gap:14, flexShrink:0, flexWrap:'wrap',
      }}>
        <div>
          <div style={{ fontWeight:800, fontSize:15 }}>{person.full_name}</div>
          <div style={{ fontSize:11, color:'#93c5fd', marginTop:2 }}>
            {[person.employee_code, person.position, person.department_name].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div style={{ flex:1 }} />
        <button onClick={fillWeekdays} style={{
          padding:'5px 12px', borderRadius:8, border:'none', cursor:'pointer',
          background:'rgba(251,191,36,.2)', color:'#fbbf24', fontSize:12, fontWeight:700,
        }}>⚡ Check đủ ngày thường</button>

        {/* Save button */}
        <button
          onClick={flushSave}
          disabled={saving}
          style={{
            padding:'7px 18px', borderRadius:9, border:'none',
            cursor: saving ? 'wait' : 'pointer', fontWeight:700, fontSize:13,
            display:'flex', alignItems:'center', gap:6, transition:'all .2s',
            background: saving        ? 'rgba(255,255,255,.1)'
                       : saveStatus==='saved' ? '#16a34a'
                       : dirty              ? '#f59e0b'
                       : 'rgba(255,255,255,.15)',
            color: 'white',
            boxShadow: dirty && !saving ? '0 0 0 2px #fbbf24' : 'none',
          }}
        >
          <span style={{ fontSize:15 }}>
            {saving ? '⏳' : saveStatus==='saved' ? '✓' : dirty ? '●' : '💾'}
          </span>
          {saving ? 'Đang lưu...' : saveStatus==='saved' ? 'Đã lưu' : dirty ? 'Lưu (có thay đổi)' : 'Lưu'}
        </button>

        <SChip label="Ngày công" val={workDays} unit="ngày" c="#60a5fa" />
        <SChip label="Tổng giờ"  val={totalH}   unit="giờ"  c="#34d399" />
        <SChip label="Tăng ca"   val={otH}       unit="giờ"  c="#fbbf24" />
      </div>

      {/* Table */}
      <div style={{ flex:1, overflow:'auto' }}>
        <table style={{ borderCollapse:'collapse', fontSize:13, tableLayout:'fixed', minWidth:'100%' }}>
          <colgroup>
            <col style={{width:44}}/>{/* Ngày */}
            <col style={{width:38}}/>{/* Thứ */}
            <col style={{width:36}}/>{/* S */}
            <col style={{width:36}}/>{/* C */}
            <col style={{width:82}}/>{/* Việc Chính auto */}
            {subRows.map(r=><col key={r.row_index} style={{width:84}}/>)}
            <col style={{width:28}}/>{/* + */}
            <col style={{width:58}}/>{/* Total */}
            <col style={{width:160}}/>{/* Ghi chú ngày */}
          </colgroup>

          <thead>
            <tr>
              <th style={{...VTH,position:'sticky',left:0,zIndex:4}}>Ngày</th>
              <th style={{...VTH,position:'sticky',left:44,zIndex:4,borderRight:'2px solid rgba(255,255,255,.2)'}}>Thứ</th>
              <th style={{...VTH,background:'#1d4ed8',fontSize:11,letterSpacing:.3,paddingBottom:2}}>
                S<div style={{fontSize:8,opacity:.6,fontWeight:400}}>4h</div>
              </th>
              <th style={{...VTH,background:'#1d4ed8',fontSize:11,letterSpacing:.3,paddingBottom:2,borderRight:'2px solid rgba(255,255,255,.25)'}}>
                C<div style={{fontSize:8,opacity:.6,fontWeight:400}}>4h</div>
              </th>

              {/* Việc Chính — auto, read-only */}
              <th style={{...VTH,background:'#065f46',padding:'7px 6px',verticalAlign:'middle'}}>
                <div style={{fontWeight:700,fontSize:11}}>{mainRow?.work_description||'Việc Chính'}</div>
                {mainRow?.row_label && <div style={{fontSize:9,color:'#6ee7b7',marginTop:2}}>{mainRow.row_label}</div>}
                <div style={{fontSize:8,color:'rgba(255,255,255,.4)',marginTop:3}}>= S+C − Phụ</div>
              </th>

              {/* Việc Phụ columns */}
              {subRows.map(row => (
                <th key={row.row_index} style={{...VTH,padding:'6px 8px',verticalAlign:'top'}}>
                  {editCol===`d${row.row_index}` ? (
                    <input autoFocus list={`dg-${pid}-${row.row_index}`}
                      value={row.work_description||''}
                      onChange={e=>patchRow(pid,row.row_index,{...row,work_description:e.target.value})}
                      onBlur={()=>setEditCol(null)} onKeyDown={e=>e.key==='Enter'&&setEditCol(null)}
                      style={{width:'100%',background:'rgba(255,255,255,.15)',border:'none',color:'white',
                              textAlign:'center',fontSize:11,outline:'none',borderRadius:4,padding:'2px 4px',fontWeight:700}}/>
                  ) : (
                    <div onClick={()=>setEditCol(`d${row.row_index}`)} title="Nhấn để đổi tên"
                      style={{fontWeight:700,fontSize:11,cursor:'pointer',borderBottom:'1px dashed rgba(255,255,255,.3)',paddingBottom:2}}>
                      {row.work_description||'Việc Phụ'}
                    </div>
                  )}
                  <datalist id={`dg-${pid}-${row.row_index}`}>{DIENGIAI.map(d=><option key={d} value={d}/>)}</datalist>
                  {editCol===`l${row.row_index}` ? (
                    <input autoFocus value={row.row_label||''} placeholder="Máy / vị trí..."
                      onChange={e=>patchRow(pid,row.row_index,{...row,row_label:e.target.value||null})}
                      onBlur={()=>setEditCol(null)} onKeyDown={e=>e.key==='Enter'&&setEditCol(null)}
                      style={{width:'100%',background:'rgba(255,255,255,.1)',border:'none',color:'#93c5fd',
                              textAlign:'center',fontSize:9,outline:'none',borderRadius:4,padding:'1px 4px',marginTop:3}}/>
                  ) : (
                    <div onClick={()=>setEditCol(`l${row.row_index}`)}
                      style={{fontSize:9,color:row.row_label?'#93c5fd':'rgba(255,255,255,.3)',cursor:'pointer',marginTop:3,minHeight:12}}>
                      {row.row_label||'+ máy/vị trí'}
                    </div>
                  )}
                  {row.id && (
                    <div style={{marginTop:4}}>
                      <button onClick={()=>{if(!window.confirm('Xoá cột này?'))return;delMut.mutate(row.id);setDrafts(p=>{const n={...p};delete n[`${pid}:${row.row_index}`];return n})}}
                        style={{...HBTN('#f87171','rgba(248,113,113,.15)'),fontSize:9,padding:'2px 6px'}}>🗑 Xoá</button>
                    </div>
                  )}
                </th>
              ))}

              <th style={{...VTH,background:'#374151',cursor:'pointer',fontSize:18,fontWeight:300}}
                  onClick={()=>addRow(pid)} title="Thêm Việc Phụ">+</th>
              <th style={{...VTH,background:'#2d3f6b',borderLeft:'2px solid rgba(255,255,255,.2)'}}>
                Tổng<br/><span style={{fontSize:8,opacity:.6}}>giờ</span>
              </th>
              <th style={{...VTH,background:'#374151',textAlign:'left',paddingLeft:8}}>
                Ghi chú ngày
              </th>
            </tr>
          </thead>

          <tbody>
            {days.map(d => {
              const dow    = new Date(year,month-1,d).getDay()
              const isWknd = dow===0||dow===6
              const sess   = sessions[d]||{s:false,c:false}
              const avail  = (sess.s?4:0)+(sess.c?4:0)
              const mainH  = parseFloat((mainRow?.hours||{})[String(d)]||0)
              const subTot = subRows.reduce((s,r)=>s+parseFloat((r.hours||{})[String(d)]||0),0)
              const dayTot = mainH+subTot
              const isOt   = dayTot > 8
              const active = avail > 0
              const rowBg  = isWknd ? '#fffbeb' : active ? 'white' : '#f9fafb'

              return (
                <tr key={d} style={{background:rowBg}}>
                  {/* Ngày */}
                  <td style={{...VTD,position:'sticky',left:0,background:rowBg,zIndex:1,
                    textAlign:'center',fontWeight:700,fontSize:14,
                    color:isWknd?'#d97706':active?'#1e293b':'#c9d0d8'}}>
                    {d}
                  </td>
                  {/* Thứ */}
                  <td style={{...VTD,position:'sticky',left:44,background:rowBg,zIndex:1,
                    textAlign:'center',fontSize:11,color:isWknd?'#d97706':'#94a3b8',
                    borderRight:'2px solid #e2e8f0'}}>
                    {DOW_SHORT[dow]}
                  </td>
                  {/* S button */}
                  <td style={{...VTD,textAlign:'center',padding:'3px 3px'}}>
                    <button onClick={()=>toggleSession(d,'s')} title="Sáng (4h)"
                      style={{width:28,height:28,borderRadius:7,border:'none', cursor:'pointer',
                        background: sess.s ? (isWknd?'#d97706':'#2563eb') : '#f1f5f9',
                        color: sess.s?'white':'#94a3b8',
                        fontSize:11,fontWeight:700,transition:'all .12s',
                        boxShadow: sess.s ? (isWknd?'0 2px 6px #d9780655':'0 2px 6px #2563eb55') : 'none',
                      }}>S</button>
                  </td>
                  {/* C button */}
                  <td style={{...VTD,textAlign:'center',padding:'3px 3px',borderRight:'2px solid #e2e8f0'}}>
                    <button onClick={()=>toggleSession(d,'c')} title="Chiều (4h)"
                      style={{width:28,height:28,borderRadius:7,border:'none', cursor:'pointer',
                        background: sess.c ? (isWknd?'#d97706':'#2563eb') : '#f1f5f9',
                        color: sess.c?'white':'#94a3b8',
                        fontSize:11,fontWeight:700,transition:'all .12s',
                        boxShadow: sess.c ? (isWknd?'0 2px 6px #d9780655':'0 2px 6px #2563eb55') : 'none',
                      }}>C</button>
                  </td>

                  {/* Việc Chính (computed, read-only) */}
                  <td style={{...VTD,textAlign:'center',padding:'2px 4px',
                    background:mainH>0?'#ecfdf5':active?'#f0fdf4':rowBg,
                    borderRight:'1px solid #d1fae5'}}>
                    <div style={{
                      fontSize:16,fontWeight:mainH>0?700:400,padding:'3px 0',
                      color:mainH>0?'#059669':active?'#a7f3d0':'transparent',
                      userSelect:'none',
                    }}>
                      {mainH > 0 ? mainH : active ? '–' : ''}
                    </div>
                  </td>

                  {/* Sub cols (editable) */}
                  {subRows.map(row => {
                    const h = parseFloat((row.hours||{})[String(d)]||0)
                    return (
                      <td key={row.row_index} style={{...VTD,padding:'3px 5px',textAlign:'center',background:rowBg}}>
                        <input type="number" min={0} max={24} step={0.5}
                          value={h>0?h:''}
                          onChange={e=>handleSubChange(row.row_index,d,e.target.value)}
                          disabled={!active}
                          placeholder={active?'–':''}
                          style={{width:'100%',border:'1px solid transparent',background:'transparent',
                            textAlign:'center',fontSize:15,outline:'none',borderRadius:6,
                            color:h>0?'#7c3aed':'#d1d5db',fontWeight:h>0?600:400,padding:'3px 0',
                            opacity:active?1:.25,cursor:active?'text':'not-allowed'}}
                          onFocus={e=>{e.target.style.borderColor='#a78bfa';e.target.style.background='white'}}
                          onBlur={e=>{e.target.style.borderColor='transparent';e.target.style.background='transparent'}}
                        />
                      </td>
                    )
                  })}

                  <td style={{...VTD,background:rowBg}}/>

                  {/* Day total */}
                  <td style={{...VTD,textAlign:'center',borderLeft:'2px solid #e2e8f0',
                    background:isOt?'#dcfce7':active?'#f8fafc':rowBg,
                    fontWeight:dayTot>0?700:400,fontSize:14,
                    color:isOt?'#16a34a':dayTot>0?'#1e293b':'#e2e8f0'}}>
                    {dayTot>0 ? +dayTot.toFixed(1) : '–'}
                  </td>
                  {/* Per-day note */}
                  <td style={{...VTD, padding:'2px 6px', background: dayNotes[String(d)] ? '#fffbeb' : rowBg}}>
                    <input
                      value={dayNotes[String(d)]||''}
                      onChange={e => setDayNote(d, e.target.value)}
                      placeholder="Ghi chú..."
                      style={{
                        width:'100%', border:'none', background:'transparent',
                        fontSize:11, outline:'none', color:'#475569',
                        overflow:'hidden', textOverflow:'ellipsis',
                      }}
                      onFocus={e => e.target.style.background='white'}
                      onBlur={e  => e.target.style.background='transparent'}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>

          <tfoot>
            <tr style={{background:'#e8ecf4'}}>
              <td colSpan={4} style={FTLBL}>Tổng tháng</td>
              <td style={FTVAL('#059669')}>{calcRow(mainRow?.hours||{},numDays).total||'–'}</td>
              {subRows.map(row=>{const{total}=calcRow(row.hours||{},numDays);return <td key={row.row_index} style={FTVAL('#7c3aed')}>{total||'–'}</td>})}
              <td style={VTD}/><td style={{...FTVAL('#16a34a'),borderLeft:'2px solid #e2e8f0'}}>{totalH||'–'}</td>
              <td style={VTD}/>
            </tr>
            <tr style={{background:'#f1f5f9'}}>
              <td colSpan={4} style={FTLBL}>Ngày công</td>
              <td style={FTVAL('#2563eb')}>{calcRow(mainRow?.hours||{},numDays).workDays||'–'}</td>
              {subRows.map(row=><td key={row.row_index} style={VTD}/>)}
              <td style={VTD}/><td style={{...FTVAL('#2563eb'),borderLeft:'2px solid #e2e8f0'}}>{workDays||'–'}</td>
              <td style={VTD}/>
            </tr>
            <tr style={{background:'#f1f5f9'}}>
              <td colSpan={4} style={FTLBL}>Tăng ca (h)</td>
              <td style={VTD}/>
              {subRows.map(row=><td key={row.row_index} style={VTD}/>)}
              <td style={VTD}/><td style={{...FTVAL(otH>0?'#d97706':'#94a3b8'),borderLeft:'2px solid #e2e8f0'}}>{otH||'–'}</td>
              <td style={VTD}/>
            </tr>
            <tr style={{background:'#fffbeb'}}>
              <td colSpan={4} style={{...FTLBL,color:'#92400e'}}>Nghỉ phép</td>
              <td style={{...VTD,padding:'3px 5px'}}>
                <input type="number" min={0} step={0.5}
                  value={parseFloat(mainRow?.leave_days||0)>0?mainRow.leave_days:''}
                  onChange={e=>mainRow&&patchRow(pid,0,{...mainRow,leave_days:parseFloat(e.target.value)||0})}
                  placeholder="0"
                  style={{width:'100%',border:'1px solid #fde68a',background:'#fffbeb',textAlign:'center',
                    fontSize:13,outline:'none',borderRadius:5,padding:'3px 0',fontWeight:700,color:'#92400e'}}/>
              </td>
              {subRows.map(row=><td key={row.row_index} style={VTD}/>)}
              <td colSpan={3} style={VTD}/>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{padding:'5px 14px',fontSize:10,color:'#94a3b8',background:'white',borderTop:'1px solid #f1f5f9',flexShrink:0}}>
        S = Sáng (4h) · C = Chiều (4h) · Việc Chính tự tính = (S+C) − Phụ · 💾 Lưu hoặc tự lưu sau 0.8s · Click tên cột để đổi
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

// vertical-layout table styles
const VTH = {
  background:'#1a2744', color:'white', padding:'8px 6px', textAlign:'center',
  borderRight:'1px solid rgba(255,255,255,.12)', whiteSpace:'nowrap',
  position:'sticky', top:0, zIndex:2, fontSize:11,
}

const VTD = {
  padding:'2px 4px', borderBottom:'1px solid #f0f0f0', borderRight:'1px solid #f0f0f0',
  verticalAlign:'middle',
}

const FTLBL = {
  ...VTD, textAlign:'right', paddingRight:10, fontSize:11, fontWeight:700,
  color:'#1a2744', background:'inherit',
}

function FTVAL(color) {
  return { ...VTD, textAlign:'center', fontWeight:700, fontSize:13, color }
}

function HBTN(color, bg) {
  return {
    fontSize:9, padding:'2px 5px', background: bg, border:'none',
    color, borderRadius:4, cursor:'pointer', fontWeight:600,
  }
}
