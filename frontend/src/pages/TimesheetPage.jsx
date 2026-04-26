/**
 * TimesheetPage v2 — Chấm công + Phân bổ công việc + Báo cáo tháng
 *
 * Layout: TopBar | EmployeeList (left) | ContentPanel (right)
 * Tabs: 1) Chấm công  2) Phân bổ công việc  3) Báo cáo tháng
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { attendanceApi, personnelApi, deptApi, locationApi } from '../services/api'

// ─── constants ───────────────────────────────────────────────────────────────

const today   = new Date()
const STD_IN  = 8 * 60    // 08:00
const STD_OUT = 17 * 60   // 17:00
const STD_H   = 8         // standard work hours/day

const STATUS = {
  present: { label: 'Có mặt',  color: '#16a34a', bg: '#dcfce7' },
  absent:  { label: 'Vắng',    color: '#dc2626', bg: '#fee2e2' },
  leave:   { label: 'Nghỉ phép', color: '#d97706', bg: '#fef3c7' },
  holiday: { label: 'Nghỉ lễ', color: '#2563eb', bg: '#dbeafe' },
}

const DOW_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

// ─── helpers ─────────────────────────────────────────────────────────────────

function daysInMonth(y, m) { return new Date(y, m, 0).getDate() }

function fmtDate(y, m, d) {
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}

function autoCalc(ci, co) {
  if (!ci || !co) return {}
  const [ih, im] = ci.split(':').map(Number)
  const [oh, om] = co.split(':').map(Number)
  const inM = ih*60+im, outM = oh*60+om
  if (outM <= inM) return {}
  const totalH = (outM - inM) / 60
  return {
    total_hours:          +totalH.toFixed(2),
    overtime_hours:       +Math.max(0, totalH - STD_H).toFixed(2),
    late_minutes:         Math.max(0, inM  - STD_IN),
    early_leave_minutes:  Math.max(0, STD_OUT - outM),
    status: 'present',
  }
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function TimesheetPage() {
  const qc = useQueryClient()

  const [year,    setYear]    = useState(today.getFullYear())
  const [month,   setMonth]   = useState(today.getMonth() + 1)
  const [deptId,  setDeptId]  = useState('')
  const [search,  setSearch]  = useState('')
  const [selPid,  setSelPid]  = useState(null)
  const [tab,     setTab]     = useState('attendance')   // attendance | worklogs | report
  const [saving,  setSaving]  = useState(false)

  // local att drafts: { "pid:YYYY-MM-DD": draft }
  const [localAtt, setLocalAtt] = useState({})
  const pendingRef               = useRef({})
  const saveTimer                = useRef(null)

  const numDays = daysInMonth(year, month)
  const days    = Array.from({ length: numDays }, (_, i) => i + 1)

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: attendances = [], isLoading: loadAtt } = useQuery({
    queryKey: ['attendance', year, month, deptId],
    queryFn: () => attendanceApi.list({ year, month, ...(deptId ? { dept_id: deptId } : {}) })
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

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationApi.list().then(r => r.data),
  })

  const { data: workLogs = [] } = useQuery({
    queryKey: ['work-logs', year, month],
    queryFn: () => attendanceApi.listWorkLogs({ year, month }).then(r => r.data),
  })

  const { data: reportData, isLoading: loadReport } = useQuery({
    queryKey: ['att-report', year, month, deptId],
    queryFn: () => attendanceApi.report({ year, month, ...(deptId ? { dept_id: deptId } : {}) })
      .then(r => r.data),
    enabled: tab === 'report',
  })

  // ── build attendance map ───────────────────────────────────────────────────

  const attMap = {}
  for (const a of attendances) {
    attMap[`${a.personnel_id}:${a.date}`] = a
  }

  function getAtt(pid, dateStr) {
    const key = `${pid}:${dateStr}`
    return localAtt[key] ?? attMap[key] ?? null
  }

  // ── filtered employees ─────────────────────────────────────────────────────

  const filteredP = allPersonnel.filter(p => {
    if (p.is_active === false) return false
    if (deptId && String(p.department_id) !== deptId) return false
    if (search && !p.full_name?.toLowerCase().includes(search.toLowerCase()) &&
        !p.employee_code?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // auto-select first
  useEffect(() => {
    if (filteredP.length > 0 && !filteredP.find(p => String(p.id) === selPid))
      setSelPid(String(filteredP[0].id))
  }, [filteredP.length])

  // reset drafts on period change
  useEffect(() => { setLocalAtt({}); pendingRef.current = {} }, [year, month, deptId])

  // ── upsert mutation ────────────────────────────────────────────────────────

  const upsertMut = useMutation({
    mutationFn: ({ pid, date, data }) => attendanceApi.upsert(pid, date, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance', year, month, deptId] }),
  })

  const triggerSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const batch = pendingRef.current
      if (!Object.keys(batch).length) return
      pendingRef.current = {}
      setSaving(true)
      try {
        await Promise.all(
          Object.entries(batch).map(([key, data]) => {
            const [pid, date] = key.split(/:(.+)/)  // split on first colon only
            return upsertMut.mutateAsync({ pid, date, data })
          })
        )
      } finally { setSaving(false) }
    }, 900)
  }, [upsertMut])

  function patchAtt(pid, dateStr, patch) {
    const key = `${pid}:${dateStr}`
    const base = getAtt(pid, dateStr) || {
      personnel_id: pid, date: dateStr,
      check_in: null, check_out: null,
      total_hours: 0, late_minutes: 0, early_leave_minutes: 0,
      overtime_hours: 0, status: 'present', notes: null,
    }
    const draft = { ...base, ...patch }
    setLocalAtt(prev => ({ ...prev, [key]: draft }))
    pendingRef.current = { ...pendingRef.current, [key]: draft }
    triggerSave()
  }

  function handleTimeChange(pid, dateStr, field, value) {
    const base = getAtt(pid, dateStr) || {}
    const ci = field === 'check_in'  ? value : base.check_in
    const co = field === 'check_out' ? value : base.check_out
    patchAtt(pid, dateStr, { ...base, [field]: value || null, ...autoCalc(ci, co) })
  }

  // ── employee mini-summary ──────────────────────────────────────────────────

  function empSummary(pid) {
    let workDays = 0, totalH = 0, ot = 0, leave = 0
    for (let d = 1; d <= numDays; d++) {
      const rec = getAtt(pid, fmtDate(year, month, d))
      if (!rec) continue
      if (rec.status === 'leave')    leave++
      if (rec.status === 'absent')   continue
      if (rec.total_hours > 0) {
        workDays++
        totalH += parseFloat(rec.total_hours || 0)
        ot     += parseFloat(rec.overtime_hours || 0)
      }
    }
    return { workDays, totalH: +totalH.toFixed(1), ot: +ot.toFixed(1), leave }
  }

  const selPerson = filteredP.find(p => String(p.id) === selPid)

  // ── export ─────────────────────────────────────────────────────────────────

  async function handleExport() {
    const res = await attendanceApi.export({ year, month, ...(deptId ? { dept_id: deptId } : {}) })
    const url = URL.createObjectURL(new Blob([res.data]))
    const a   = document.createElement('a')
    a.href = url
    a.download = `cham_cong_T${String(month).padStart(2,'0')}_${year}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── render ─────────────────────────────────────────────────────────────────

  const showLeft = tab !== 'report'

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#f1f5f9' }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div style={{
        display:'flex', alignItems:'center', gap:8, padding:'8px 16px',
        background:'white', borderBottom:'1px solid #e2e8f0', flexShrink:0, flexWrap:'wrap',
      }}>
        <span style={{ fontWeight:800, fontSize:17, color:'#1a2744', marginRight:4 }}>🗓️ Chấm công</span>

        <select style={SEL} value={month} onChange={e => setMonth(+e.target.value)}>
          {Array.from({length:12},(_,i)=>i+1).map(m =>
            <option key={m} value={m}>Tháng {m}</option>
          )}
        </select>

        <select style={SEL} value={year} onChange={e => setYear(+e.target.value)}>
          {[year-1, year, year+1].map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <select style={SEL} value={deptId} onChange={e => setDeptId(e.target.value)}>
          <option value="">Tất cả phòng ban</option>
          {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        {/* Tabs */}
        <div style={{ display:'flex', gap:2, marginLeft:8 }}>
          {[
            { key:'attendance', label:'🗓️ Chấm công' },
            { key:'worklogs',   label:'📋 Phân bổ CV' },
            { key:'report',     label:'📊 Báo cáo' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding:'5px 12px', borderRadius:7, border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
              background: tab===t.key ? '#1a2744' : '#f1f5f9',
              color:      tab===t.key ? 'white'   : '#475569',
              transition:'all 0.15s',
            }}>{t.label}</button>
          ))}
        </div>

        {saving && <span style={{ fontSize:11, color:'#64748b', marginLeft:4 }}>Đang lưu...</span>}
        <div style={{ flex:1 }} />

        <button onClick={handleExport} style={{ ...BTN, background:'#1a2744', color:'white' }}>
          ⬇ Xuất Excel
        </button>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

        {/* Left: employee list */}
        {showLeft && (
          <EmployeeList
            personnel={filteredP}
            selPid={selPid}
            setSelPid={setSelPid}
            search={search}
            setSearch={setSearch}
            empSummary={empSummary}
            isLoading={loadAtt}
          />
        )}

        {/* Right: content */}
        <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
          {tab === 'attendance' && selPerson && (
            <AttendanceGrid
              person={selPerson}
              days={days}
              year={year}
              month={month}
              getAtt={getAtt}
              patchAtt={patchAtt}
              handleTimeChange={handleTimeChange}
            />
          )}
          {tab === 'worklogs' && selPerson && (
            <WorkLogPanel
              person={selPerson}
              year={year}
              month={month}
              days={days}
              workLogs={workLogs}
              locations={locations.filter(l => l.is_active !== false)}
              getAtt={getAtt}
              qc={qc}
            />
          )}
          {tab === 'report' && (
            <ReportMatrix
              reportData={reportData}
              year={year}
              month={month}
            />
          )}
          {!selPerson && tab !== 'report' && (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8' }}>
              Chọn nhân viên để bắt đầu
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

// ─── EmployeeList ─────────────────────────────────────────────────────────────

function EmployeeList({ personnel, selPid, setSelPid, search, setSearch, empSummary, isLoading }) {
  return (
    <div style={{
      width:230, flexShrink:0, background:'white', borderRight:'1px solid #e2e8f0',
      display:'flex', flexDirection:'column', overflow:'hidden',
    }}>
      <div style={{ padding:'10px 10px 6px' }}>
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
      <div style={{ padding:'0 10px 6px', fontSize:11, color:'#94a3b8' }}>
        {personnel.length} nhân viên
      </div>
      <div style={{ flex:1, overflowY:'auto' }}>
        {isLoading
          ? <div style={{ padding:20, textAlign:'center', color:'#94a3b8', fontSize:12 }}>Đang tải...</div>
          : personnel.map(p => {
            const pid  = String(p.id)
            const act  = pid === selPid
            const summ = empSummary(pid)
            return (
              <div
                key={pid}
                onClick={() => setSelPid(pid)}
                style={{
                  padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid #f1f5f9',
                  background: act ? '#eff6ff' : 'white',
                  borderLeft: act ? '3px solid #3b82f6' : '3px solid transparent',
                }}
              >
                <div style={{ fontWeight: act ? 700 : 500, fontSize:12.5, color:'#1e293b' }}>
                  {p.full_name}
                </div>
                {p.employee_code && (
                  <div style={{ fontSize:10, color:'#94a3b8', marginTop:1 }}>{p.employee_code}</div>
                )}
                <div style={{ display:'flex', gap:3, marginTop:4, flexWrap:'wrap' }}>
                  {summ.workDays > 0  && <Chip c="#2563eb" bg="#dbeafe">{summ.workDays}N</Chip>}
                  {summ.totalH > 0    && <Chip c="#059669" bg="#d1fae5">{summ.totalH}h</Chip>}
                  {summ.ot > 0        && <Chip c="#d97706" bg="#fef3c7">TC {summ.ot}h</Chip>}
                  {summ.leave > 0     && <Chip c="#dc2626" bg="#fee2e2">NP {summ.leave}</Chip>}
                </div>
              </div>
            )
          })
        }
      </div>
    </div>
  )
}

// ─── AttendanceGrid ───────────────────────────────────────────────────────────

function AttendanceGrid({ person, days, year, month, getAtt, patchAtt, handleTimeChange }) {
  const pid = String(person.id)

  // person-level summary
  let totalH = 0, workDays = 0, otH = 0, leaveDays = 0
  for (const d of days) {
    const rec = getAtt(pid, fmtDate(year, month, d))
    if (!rec) continue
    if (rec.status === 'leave') leaveDays++
    if (rec.status === 'present' && rec.total_hours > 0) {
      workDays++
      totalH += parseFloat(rec.total_hours    || 0)
      otH    += parseFloat(rec.overtime_hours || 0)
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Person header */}
      <div style={{
        padding:'10px 18px', background:'#1a2744', color:'white',
        display:'flex', alignItems:'center', gap:16, flexShrink:0,
      }}>
        <div>
          <div style={{ fontWeight:800, fontSize:15 }}>{person.full_name}</div>
          <div style={{ fontSize:11, color:'#93c5fd', marginTop:2 }}>
            {[person.employee_code, person.position, person.department_name].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div style={{ flex:1 }} />
        <SChip label="Ngày công"  val={workDays}          unit="ngày" c="#60a5fa" />
        <SChip label="Tổng giờ"   val={totalH.toFixed(1)} unit="giờ"  c="#34d399" />
        <SChip label="Tăng ca"    val={otH.toFixed(1)}    unit="giờ"  c="#fbbf24" />
        <SChip label="Nghỉ phép"  val={leaveDays}         unit="ngày" c="#c084fc" />
      </div>

      {/* Grid */}
      <div style={{ flex:1, overflowX:'auto', overflowY:'auto' }}>
        <table style={{ borderCollapse:'collapse', minWidth:'100%', fontSize:12 }}>
          <thead>
            <tr>
              {['Ngày','Thứ','Vào','Ra','Tổng giờ','Trễ (ph)','Về sớm (ph)','OT (h)','Trạng thái','Ghi chú'].map(h => (
                <th key={h} style={ATH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map(d => {
              const dateStr = fmtDate(year, month, d)
              const rec     = getAtt(pid, dateStr) || {}
              const dow     = new Date(year, month - 1, d).getDay()
              const isWknd  = dow === 0 || dow === 6
              const status  = rec.status || 'present'
              const st      = STATUS[status] || STATUS.present
              const rowBg   = status === 'absent'  ? '#fff5f5'
                            : status === 'leave'   ? '#fffbeb'
                            : status === 'holiday' ? '#eff6ff'
                            : isWknd               ? '#fefce8'
                            : 'white'
              return (
                <tr key={d} style={{ background: rowBg }}>
                  <td style={{ ...ATD, fontWeight:700, width:36, textAlign:'center',
                                color: isWknd ? '#d97706' : '#1e293b' }}>
                    {d}
                  </td>
                  <td style={{ ...ATD, width:30, textAlign:'center', fontSize:10,
                                color: isWknd ? '#d97706' : '#64748b' }}>
                    {DOW_SHORT[dow]}
                  </td>
                  {/* Check-in */}
                  <td style={{ ...ATD, width:72 }}>
                    <input
                      type="time"
                      value={rec.check_in  || ''}
                      onChange={e => handleTimeChange(pid, dateStr, 'check_in', e.target.value)}
                      style={TINP}
                    />
                  </td>
                  {/* Check-out */}
                  <td style={{ ...ATD, width:72 }}>
                    <input
                      type="time"
                      value={rec.check_out || ''}
                      onChange={e => handleTimeChange(pid, dateStr, 'check_out', e.target.value)}
                      style={TINP}
                    />
                  </td>
                  {/* Total hours (auto, editable) */}
                  <td style={{ ...ATD, width:70, background:'#f0fdf4' }}>
                    <input
                      type="number" min={0} max={24} step={0.5}
                      value={parseFloat(rec.total_hours || 0) > 0 ? rec.total_hours : ''}
                      onChange={e => patchAtt(pid, dateStr, { ...rec, total_hours: parseFloat(e.target.value)||0 })}
                      style={{ ...NINP, color:'#16a34a', fontWeight:700 }}
                    />
                  </td>
                  {/* Late */}
                  <td style={{ ...ATD, width:64 }}>
                    <input
                      type="number" min={0} step={1}
                      value={parseInt(rec.late_minutes || 0) > 0 ? rec.late_minutes : ''}
                      onChange={e => patchAtt(pid, dateStr, { ...rec, late_minutes: parseInt(e.target.value)||0 })}
                      style={{ ...NINP, color:'#dc2626' }}
                    />
                  </td>
                  {/* Early leave */}
                  <td style={{ ...ATD, width:80 }}>
                    <input
                      type="number" min={0} step={1}
                      value={parseInt(rec.early_leave_minutes || 0) > 0 ? rec.early_leave_minutes : ''}
                      onChange={e => patchAtt(pid, dateStr, { ...rec, early_leave_minutes: parseInt(e.target.value)||0 })}
                      style={{ ...NINP, color:'#ea580c' }}
                    />
                  </td>
                  {/* OT */}
                  <td style={{ ...ATD, width:60, background: parseFloat(rec.overtime_hours||0) > 0 ? '#dcfce7' : 'inherit' }}>
                    <input
                      type="number" min={0} max={16} step={0.5}
                      value={parseFloat(rec.overtime_hours||0) > 0 ? rec.overtime_hours : ''}
                      onChange={e => patchAtt(pid, dateStr, { ...rec, overtime_hours: parseFloat(e.target.value)||0 })}
                      style={{ ...NINP, color:'#16a34a', fontWeight:700 }}
                    />
                  </td>
                  {/* Status */}
                  <td style={{ ...ATD, width:110 }}>
                    <select
                      value={status}
                      onChange={e => patchAtt(pid, dateStr, { ...rec, status: e.target.value })}
                      style={{
                        width:'100%', border:'none', borderRadius:5,
                        padding:'2px 4px', fontSize:11, fontWeight:600, outline:'none',
                        cursor:'pointer', background: st.bg, color: st.color,
                      }}
                    >
                      {Object.entries(STATUS).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </td>
                  {/* Notes */}
                  <td style={{ ...ATD, minWidth:140 }}>
                    <input
                      placeholder="Ghi chú..."
                      value={rec.notes || ''}
                      onChange={e => patchAtt(pid, dateStr, { ...rec, notes: e.target.value })}
                      style={{ width:'100%', border:'none', background:'transparent',
                               fontSize:11, outline:'none', padding:'2px 4px' }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ padding:'5px 14px', fontSize:10, color:'#94a3b8', background:'white',
                    borderTop:'1px solid #f1f5f9', flexShrink:0 }}>
        Tự lưu sau 1 giây · Giờ vào/ra tự tính Tổng giờ, Trễ, OT theo ca chuẩn 08:00–17:00
      </div>
    </div>
  )
}

// ─── WorkLogPanel ─────────────────────────────────────────────────────────────

function WorkLogPanel({ person, year, month, days, workLogs, locations, getAtt, qc }) {
  const pid = String(person.id)

  const [selDay, setSelDay] = useState(
    () => Math.min(today.getDate(), days.length)
  )
  const [newForm, setNewForm] = useState({ location_id:'', task_type:'main', hours:'', notes:'' })
  const [editId,  setEditId]  = useState(null)
  const [editForm, setEditForm] = useState({})

  const dateStr = fmtDate(year, month, selDay)
  const attRec  = getAtt(pid, dateStr)
  const totalAvail = parseFloat(attRec?.total_hours || 0)

  const dayLogs = workLogs.filter(
    wl => String(wl.personnel_id) === pid && wl.date === dateStr
  )
  const allocated = dayLogs.reduce((s, wl) => s + parseFloat(wl.hours || 0), 0)

  const createMut = useMutation({
    mutationFn: (data) => attendanceApi.createWorkLog(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-logs'] }); setNewForm({ location_id:'', task_type:'main', hours:'', notes:'' }) },
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => attendanceApi.updateWorkLog(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-logs'] }); setEditId(null) },
  })
  const deleteMut = useMutation({
    mutationFn: (id) => attendanceApi.deleteWorkLog(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-logs'] }),
  })

  function submitNew() {
    if (!newForm.location_id || !newForm.hours) return
    createMut.mutate({
      personnel_id: person.id, date: dateStr,
      location_id: newForm.location_id, task_type: newForm.task_type,
      hours: parseFloat(newForm.hours), notes: newForm.notes || null,
    })
  }

  // ── month summary by location ───────────────────────────────
  const monthLogs = workLogs.filter(wl => String(wl.personnel_id) === pid)
  const locSummary = {}
  for (const wl of monthLogs) {
    const key = wl.location_id
    locSummary[key] = locSummary[key] || { name: wl.location_name, code: wl.location_code, hours: 0 }
    locSummary[key].hours += parseFloat(wl.hours || 0)
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Person header */}
      <div style={{
        padding:'10px 18px', background:'#1a2744', color:'white',
        display:'flex', alignItems:'center', gap:16, flexShrink:0,
      }}>
        <div>
          <div style={{ fontWeight:800, fontSize:15 }}>{person.full_name}</div>
          <div style={{ fontSize:11, color:'#93c5fd', marginTop:2 }}>
            Phân bổ công việc theo công trình · Tháng {month}/{year}
          </div>
        </div>
        <div style={{ flex:1 }} />
        {/* Month location summary */}
        {Object.values(locSummary).map(ls => (
          <SChip key={ls.code} label={ls.code || ls.name} val={ls.hours.toFixed(1)} unit="h" c="#fbbf24" />
        ))}
      </div>

      <div style={{ flex:1, overflow:'auto', padding:'16px 20px', display:'flex', gap:20, flexWrap:'wrap', alignItems:'flex-start' }}>

        {/* Day selector */}
        <div style={{ width:220, flexShrink:0 }}>
          <div style={{ fontWeight:700, fontSize:13, color:'#1e293b', marginBottom:8 }}>Chọn ngày</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
            {days.map(d => {
              const ds    = fmtDate(year, month, d)
              const rec   = getAtt(pid, ds)
              const hasAtt = rec && parseFloat(rec.total_hours||0) > 0
              const hasLog = workLogs.some(wl => String(wl.personnel_id)===pid && wl.date===ds)
              const dow   = new Date(year, month-1, d).getDay()
              const isW   = dow===0||dow===6
              return (
                <button
                  key={d}
                  onClick={() => setSelDay(d)}
                  style={{
                    width:34, height:34, borderRadius:8, border:'none', cursor:'pointer',
                    fontSize:11, fontWeight:600,
                    background: d===selDay ? '#1a2744'
                              : hasLog     ? '#dcfce7'
                              : hasAtt     ? '#dbeafe'
                              : isW        ? '#fef9f0'
                              : '#f8fafc',
                    color: d===selDay ? 'white'
                         : hasLog ? '#16a34a'
                         : isW    ? '#d97706'
                         : '#475569',
                    outline: d===selDay ? '2px solid #3b82f6' : 'none',
                  }}
                >
                  {d}
                </button>
              )
            })}
          </div>
          <div style={{ marginTop:10, fontSize:10, color:'#94a3b8' }}>
            🟦 Có chấm công · 🟩 Có phân bổ
          </div>

          {/* Month location summary */}
          {Object.keys(locSummary).length > 0 && (
            <div style={{ marginTop:16 }}>
              <div style={{ fontWeight:700, fontSize:12, color:'#1e293b', marginBottom:6 }}>
                Tổng tháng theo vị trí
              </div>
              {Object.values(locSummary).map(ls => (
                <div key={ls.code} style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'4px 8px', borderRadius:6, background:'#f8fafc',
                  marginBottom:3, fontSize:12,
                }}>
                  <span style={{ color:'#1e293b', fontWeight:600 }}>{ls.name}</span>
                  <span style={{ color:'#16a34a', fontWeight:700 }}>{ls.hours.toFixed(1)}h</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Day detail */}
        <div style={{ flex:1, minWidth:300 }}>
          <div style={{ fontWeight:700, fontSize:13, color:'#1e293b', marginBottom:8 }}>
            Ngày {selDay}/{month} — {DOW_SHORT[new Date(year, month-1, selDay).getDay()]}
          </div>

          {/* Attendance info for this day */}
          <div style={{
            padding:'10px 14px', borderRadius:10, marginBottom:12,
            background: attRec ? '#f0fdf4' : '#f8fafc',
            border: '1px solid ' + (attRec ? '#bbf7d0' : '#e2e8f0'),
          }}>
            {attRec && parseFloat(attRec.total_hours||0) > 0 ? (
              <div style={{ display:'flex', gap:16, fontSize:12 }}>
                <span>🕐 {attRec.check_in||'--'} → {attRec.check_out||'--'}</span>
                <span style={{ fontWeight:700, color:'#16a34a' }}>
                  {parseFloat(attRec.total_hours).toFixed(1)}h làm việc
                </span>
                {parseFloat(attRec.overtime_hours||0) > 0 && (
                  <span style={{ color:'#d97706' }}>TC: {parseFloat(attRec.overtime_hours).toFixed(1)}h</span>
                )}
              </div>
            ) : (
              <span style={{ fontSize:12, color:'#94a3b8' }}>
                Chưa có dữ liệu chấm công ngày này
              </span>
            )}
            {totalAvail > 0 && (
              <div style={{ marginTop:6, fontSize:11 }}>
                Đã phân bổ:{' '}
                <strong style={{ color: allocated > totalAvail ? '#dc2626' : '#16a34a' }}>
                  {allocated.toFixed(1)} / {totalAvail.toFixed(1)}h
                </strong>
                {allocated > totalAvail && (
                  <span style={{ color:'#dc2626', marginLeft:6 }}>⚠ Vượt quá tổng giờ!</span>
                )}
              </div>
            )}
          </div>

          {/* Work logs list */}
          {dayLogs.length > 0 && (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, marginBottom:10 }}>
              <thead>
                <tr>
                  {['Công trình','Loại','Giờ','Ghi chú',''].map(h => (
                    <th key={h} style={{ ...ATH, fontSize:11, background:'#1a2744' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dayLogs.map(wl => (
                  <tr key={wl.id}>
                    {editId === wl.id ? (
                      <>
                        <td style={ATD}>
                          <select
                            value={editForm.location_id}
                            onChange={e => setEditForm({...editForm, location_id: e.target.value})}
                            style={{ width:'100%', border:'none', fontSize:11, outline:'none' }}
                          >
                            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                          </select>
                        </td>
                        <td style={ATD}>
                          <select
                            value={editForm.task_type}
                            onChange={e => setEditForm({...editForm, task_type: e.target.value})}
                            style={{ width:'100%', border:'none', fontSize:11, outline:'none' }}
                          >
                            <option value="main">Việc chính</option>
                            <option value="sub">Việc phụ</option>
                          </select>
                        </td>
                        <td style={ATD}>
                          <input type="number" min={0} step={0.5}
                            value={editForm.hours}
                            onChange={e => setEditForm({...editForm, hours: e.target.value})}
                            style={{ ...NINP, width:50 }}
                          />
                        </td>
                        <td style={ATD}>
                          <input value={editForm.notes||''}
                            onChange={e => setEditForm({...editForm, notes: e.target.value})}
                            style={{ width:'100%', border:'none', fontSize:11, outline:'none' }}
                          />
                        </td>
                        <td style={{ ...ATD, width:70 }}>
                          <button onClick={() => updateMut.mutate({ id: wl.id, data: {
                            personnel_id: person.id, date: dateStr,
                            location_id: editForm.location_id, task_type: editForm.task_type,
                            hours: parseFloat(editForm.hours), notes: editForm.notes,
                          }})} style={{ ...SBTN, background:'#16a34a', color:'white' }}>✓</button>
                          <button onClick={() => setEditId(null)}
                            style={{ ...SBTN, background:'#f1f5f9', color:'#475569', marginLeft:2 }}>×</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={ATD}><strong>{wl.location_name}</strong><br/><span style={{ color:'#94a3b8', fontSize:10 }}>{wl.location_code}</span></td>
                        <td style={{ ...ATD, textAlign:'center' }}>
                          <Chip c={wl.task_type==='main'?'#2563eb':'#7c3aed'}
                                bg={wl.task_type==='main'?'#dbeafe':'#ede9fe'}>
                            {wl.task_type==='main'?'Chính':'Phụ'}
                          </Chip>
                        </td>
                        <td style={{ ...ATD, textAlign:'center', fontWeight:700, color:'#16a34a' }}>
                          {parseFloat(wl.hours).toFixed(1)}h
                        </td>
                        <td style={{ ...ATD, color:'#64748b' }}>{wl.notes||''}</td>
                        <td style={{ ...ATD, width:60 }}>
                          <button onClick={() => { setEditId(wl.id); setEditForm({
                            location_id: wl.location_id, task_type: wl.task_type,
                            hours: wl.hours, notes: wl.notes||'',
                          })}} style={{ ...SBTN, background:'#dbeafe', color:'#2563eb' }}>✏</button>
                          <button onClick={() => { if(window.confirm('Xoá?')) deleteMut.mutate(wl.id) }}
                            style={{ ...SBTN, background:'#fee2e2', color:'#dc2626', marginLeft:2 }}>🗑</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Add new work log */}
          {locations.length > 0 ? (
            <div style={{
              padding:'12px', borderRadius:10, border:'1.5px dashed #cbd5e1',
              background:'#f8fafc',
            }}>
              <div style={{ fontWeight:700, fontSize:12, color:'#475569', marginBottom:8 }}>
                + Thêm phân bổ công việc
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'flex-end' }}>
                <div>
                  <label style={{ fontSize:10, color:'#94a3b8' }}>Vị trí / Công trình</label>
                  <select
                    value={newForm.location_id}
                    onChange={e => setNewForm({...newForm, location_id: e.target.value})}
                    style={{ ...SEL, display:'block', marginTop:2 }}
                  >
                    <option value="">Chọn...</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:10, color:'#94a3b8' }}>Loại</label>
                  <select
                    value={newForm.task_type}
                    onChange={e => setNewForm({...newForm, task_type: e.target.value})}
                    style={{ ...SEL, display:'block', marginTop:2 }}
                  >
                    <option value="main">Việc chính</option>
                    <option value="sub">Việc phụ</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:10, color:'#94a3b8' }}>Giờ</label>
                  <input
                    type="number" min={0} max={24} step={0.5}
                    placeholder="0"
                    value={newForm.hours}
                    onChange={e => setNewForm({...newForm, hours: e.target.value})}
                    style={{ ...SEL, display:'block', marginTop:2, width:64 }}
                  />
                </div>
                <div style={{ flex:1, minWidth:120 }}>
                  <label style={{ fontSize:10, color:'#94a3b8' }}>Ghi chú</label>
                  <input
                    placeholder="Mô tả..."
                    value={newForm.notes}
                    onChange={e => setNewForm({...newForm, notes: e.target.value})}
                    style={{ ...SEL, display:'block', marginTop:2, width:'100%', boxSizing:'border-box' }}
                  />
                </div>
                <button
                  onClick={submitNew}
                  disabled={!newForm.location_id || !newForm.hours}
                  style={{
                    ...BTN,
                    background: newForm.location_id && newForm.hours ? '#16a34a' : '#e2e8f0',
                    color:      newForm.location_id && newForm.hours ? 'white'   : '#94a3b8',
                  }}
                >Thêm</button>
              </div>
            </div>
          ) : (
            <div style={{ padding:12, borderRadius:10, background:'#fffbeb', color:'#92400e', fontSize:12 }}>
              ⚠ Chưa có vị trí nào. Vào <strong>Vị trí</strong> trong menu để thêm công trình.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── ReportMatrix ─────────────────────────────────────────────────────────────

function ReportMatrix({ reportData, year, month }) {
  const [locFilter, setLocFilter] = useState('')

  if (!reportData) return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8' }}>
      Đang tải báo cáo...
    </div>
  )

  const { employees, locations, num_days } = reportData
  const days = Array.from({ length: num_days }, (_, i) => i + 1)

  const filtEmp = locFilter
    ? employees.filter(emp => emp.work_logs?.[locFilter])
    : employees

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Report top bar */}
      <div style={{
        padding:'8px 16px', background:'white', borderBottom:'1px solid #e2e8f0',
        display:'flex', gap:8, alignItems:'center', flexShrink:0,
      }}>
        <span style={{ fontWeight:700, fontSize:13, color:'#1a2744' }}>
          Báo cáo tháng {month}/{year}
        </span>
        <select style={SEL} value={locFilter} onChange={e => setLocFilter(e.target.value)}>
          <option value="">Tất cả vị trí</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <span style={{ fontSize:11, color:'#94a3b8' }}>{filtEmp.length} nhân viên</span>
      </div>

      {/* Matrix */}
      <div style={{ flex:1, overflow:'auto' }}>
        <table style={{ borderCollapse:'collapse', fontSize:11, minWidth:'100%' }}>
          <thead>
            <tr>
              <th style={{ ...ATH, width:30, position:'sticky', left:0, zIndex:4 }}>STT</th>
              <th style={{ ...ATH, width:140, position:'sticky', left:30, zIndex:4, textAlign:'left', paddingLeft:8 }}>Họ và tên</th>
              <th style={{ ...ATH, width:90, position:'sticky', left:170, zIndex:4 }}>Bộ phận</th>
              {days.map(d => {
                const dow = new Date(year, month-1, d).getDay()
                const isW = dow===0||dow===6
                return (
                  <th key={d} style={{
                    ...ATH, width:30, padding:'4px 2px',
                    background: isW ? '#2d4a8a' : '#1a2744',
                  }}>
                    <div>{d}</div>
                    <div style={{ fontSize:8, opacity:0.7 }}>{DOW_SHORT[dow]}</div>
                  </th>
                )
              })}
              {['Ngày công','Tổng giờ','OT (h)','Nghỉ phép'].map(h => (
                <th key={h} style={{ ...ATH, width:60, background:'#2d3f6b' }}>{h}</th>
              ))}
              {locFilter && locations.find(l=>l.id===locFilter) && (
                <th style={{ ...ATH, width:80, background:'#064e3b' }}>
                  {locations.find(l=>l.id===locFilter)?.name} (h)
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtEmp.map((emp, gi) => {
              const bg = gi % 2 === 1 ? '#f8fafc' : 'white'
              return (
                <tr key={emp.personnel_id} style={{ background: bg }}>
                  <td style={{ ...ATD, textAlign:'center', fontWeight:700, color:'#64748b',
                                position:'sticky', left:0, background:bg }}>{gi+1}</td>
                  <td style={{ ...ATD, position:'sticky', left:30, background:bg,
                                fontWeight:700, paddingLeft:8, whiteSpace:'nowrap' }}>
                    {emp.full_name}
                    {emp.employee_code && (
                      <div style={{ fontSize:9, color:'#94a3b8', fontWeight:400 }}>{emp.employee_code}</div>
                    )}
                  </td>
                  <td style={{ ...ATD, position:'sticky', left:170, background:bg,
                                fontSize:10, color:'#64748b', whiteSpace:'nowrap' }}>
                    {emp.department_name||''}
                  </td>
                  {days.map(d => {
                    const rec = emp.days?.[String(d)]
                    if (!rec) return <td key={d} style={{ ...ATD, width:30, textAlign:'center' }} />
                    const { status, total_hours } = rec
                    const cellBg = status==='absent' ? '#fee2e2'
                                 : status==='leave'  ? '#fef3c7'
                                 : total_hours > 8   ? '#dcfce7'
                                 : bg
                    return (
                      <td key={d} style={{ ...ATD, width:30, textAlign:'center', background: cellBg,
                                           fontSize:10, fontWeight: total_hours>8 ? 700 : 400,
                                           color: status==='absent' ? '#dc2626'
                                                : status==='leave'  ? '#92400e'
                                                : total_hours>8     ? '#16a34a' : '#1e293b' }}>
                        {status==='absent'  ? 'V'
                         : status==='leave' ? 'NP'
                         : total_hours > 0  ? total_hours
                         : ''}
                      </td>
                    )
                  })}
                  <td style={{ ...ATD, textAlign:'center', fontWeight:700, background:'#e8ecf4' }}>
                    {emp.summary.work_days||''}
                  </td>
                  <td style={{ ...ATD, textAlign:'center', fontWeight:700, background:'#e8ecf4' }}>
                    {emp.summary.total_hours||''}
                  </td>
                  <td style={{ ...ATD, textAlign:'center', fontWeight:700, background:'#e8ecf4',
                                color: emp.summary.overtime_hours > 0 ? '#16a34a' : '#1e293b' }}>
                    {emp.summary.overtime_hours||''}
                  </td>
                  <td style={{ ...ATD, textAlign:'center', fontWeight:700, background:'#e8ecf4' }}>
                    {emp.summary.leave_days||''}
                  </td>
                  {locFilter && (
                    <td style={{ ...ATD, textAlign:'center', fontWeight:700, background:'#ecfdf5',
                                  color:'#16a34a' }}>
                      {emp.work_logs?.[locFilter]
                        ? emp.work_logs[locFilter].hours.toFixed(1)
                        : ''}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Micro-components ─────────────────────────────────────────────────────────

function Chip({ c, bg, children }) {
  return (
    <span style={{
      display:'inline-block', padding:'1px 5px', borderRadius:4,
      fontSize:10, fontWeight:700, color:c, background:bg,
    }}>{children}</span>
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

// ─── Shared styles ────────────────────────────────────────────────────────────

const SEL = {
  padding:'6px 10px', borderRadius:8, border:'1px solid #dde1e7',
  fontSize:12, background:'white', outline:'none',
}

const BTN = {
  padding:'7px 14px', borderRadius:8, border:'none',
  cursor:'pointer', fontSize:12, fontWeight:600,
}

const SBTN = {
  padding:'3px 7px', borderRadius:5, border:'none',
  cursor:'pointer', fontSize:12, fontWeight:600,
}

const ATH = {
  background:'#1a2744', color:'white', padding:'6px 4px',
  textAlign:'center', borderRight:'1px solid rgba(255,255,255,0.12)',
  whiteSpace:'nowrap', position:'sticky', top:0, zIndex:2, fontSize:11,
}

const ATD = {
  padding:'3px 4px', borderBottom:'1px solid #eef0f3',
  borderRight:'1px solid #eef0f3', verticalAlign:'middle',
}

const TINP = {
  width:72, border:'none', background:'transparent',
  fontSize:11, outline:'none', padding:'1px 2px',
}

const NINP = {
  width:54, border:'none', background:'transparent',
  textAlign:'center', fontSize:11, outline:'none', padding:'1px 2px',
}
