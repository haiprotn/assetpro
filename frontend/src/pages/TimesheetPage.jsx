import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { timesheetApi, personnelApi } from '../services/api'

const THIS_YEAR  = new Date().getFullYear()
const THIS_MONTH = new Date().getMonth() + 1

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `Tháng ${i + 1}` }))
const YEARS  = [THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1]

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

// ── Cell editor popover ──────────────────────────────────────
function OfficePopover({ entry, onSave, onDelete, onClose, style }) {
  const [hrs,   setHrs]   = useState(entry ? String(entry.hours_regular ?? 8) : '8')
  const [leave, setLeave] = useState(entry?.is_leave ?? false)
  const [ot,    setOt]    = useState(entry ? String(entry.overtime_hours ?? 0) : '0')
  const [ot2h,  setOt2h]  = useState(entry?.overtime_over_2h ?? false)
  const [desc,  setDesc]  = useState(entry?.work_description ?? '')

  const handleLeave = (v) => {
    setLeave(v)
    if (v) { setHrs('0'); setOt('0'); setOt2h(false) }
    else    { setHrs('8') }
  }

  return (
    <div style={{
      position: 'fixed', background: 'white', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
      padding: 16, zIndex: 1500, minWidth: 220, border: '1px solid #e2e8f0', ...style,
    }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: '#1a2744', marginBottom: 10 }}>✏️ Chỉnh sửa công</div>

      <label style={lbl}>
        <input type="checkbox" checked={leave} onChange={e => handleLeave(e.target.checked)} /> Nghỉ phép
      </label>

      {!leave && <>
        <div style={row}>
          <span style={lbl}>Giờ thường</span>
          <input style={inp} type="number" min={0} max={12} step={0.5} value={hrs} onChange={e => setHrs(e.target.value)} />
        </div>
        <div style={row}>
          <span style={lbl}>Tăng ca (giờ)</span>
          <input style={inp} type="number" min={0} max={8}  step={0.5} value={ot}  onChange={e => setOt(e.target.value)} />
        </div>
        <label style={lbl}>
          <input type="checkbox" checked={ot2h} onChange={e => setOt2h(e.target.checked)} /> Tăng ca &gt; 2h
        </label>
      </>}

      <div style={row}>
        <span style={lbl}>Công việc</span>
        <input style={{ ...inp, width: 130 }} value={desc} onChange={e => setDesc(e.target.value)} placeholder="mô tả..." />
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <button onClick={() => onSave({
          hours_regular: parseFloat(hrs) || 0,
          is_leave: leave,
          overtime_hours: parseFloat(ot) || 0,
          overtime_over_2h: ot2h,
          work_days: leave ? 0 : 1,
          work_description: desc || null,
        })} style={btnPrimary}>Lưu</button>
        {entry && <button onClick={onDelete} style={btnDanger}>Xóa</button>}
        <button onClick={onClose} style={btnGhost}>Huỷ</button>
      </div>
    </div>
  )
}

function OperatorPopover({ entry, onSave, onDelete, onClose, style }) {
  const [equip, setEquip] = useState(entry?.equipment_name ?? '')
  const [main,  setMain]  = useState(entry ? String(entry.hours_main ?? 0)      : '0')
  const [sec,   setSec]   = useState(entry ? String(entry.hours_secondary ?? 0) : '0')
  const [notes, setNotes] = useState(entry?.notes ?? '')

  return (
    <div style={{
      position: 'fixed', background: 'white', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
      padding: 16, zIndex: 1500, minWidth: 230, border: '1px solid #e2e8f0', ...style,
    }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: '#1a2744', marginBottom: 10 }}>🚜 Nhập giờ máy</div>

      <div style={row}>
        <span style={lbl}>Thiết bị</span>
        <input style={{ ...inp, width: 140 }} value={equip} onChange={e => setEquip(e.target.value)}
          placeholder="VD: LU RUNG 70SA-0435" />
      </div>
      <div style={row}>
        <span style={lbl}>Giờ việc chính</span>
        <input style={inp} type="number" min={0} max={12} step={0.5} value={main} onChange={e => setMain(e.target.value)} />
      </div>
      <div style={row}>
        <span style={lbl}>Giờ việc phụ</span>
        <input style={inp} type="number" min={0} max={12} step={0.5} value={sec}  onChange={e => setSec(e.target.value)} />
      </div>
      <div style={row}>
        <span style={lbl}>Ghi chú</span>
        <input style={{ ...inp, width: 140 }} value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <button onClick={() => onSave({
          equipment_name: equip.trim() || null,
          hours_main: parseFloat(main) || 0,
          hours_secondary: parseFloat(sec) || 0,
          notes: notes || null,
        })} style={btnPrimary}>Lưu</button>
        {entry && <button onClick={onDelete} style={btnDanger}>Xóa</button>}
        <button onClick={onClose} style={btnGhost}>Huỷ</button>
      </div>
    </div>
  )
}

// ── Inline styles ────────────────────────────────────────────
const row    = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }
const lbl    = { fontSize: 11, color: '#475569', display: 'flex', alignItems: 'center', gap: 5 }
const inp    = { padding: '5px 7px', borderRadius: 5, border: '1px solid #cbd5e1', fontSize: 12, width: 64 }
const btnPrimary = { flex: 1, padding: '7px 0', background: '#1a2744', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 12 }
const btnDanger  = { padding: '7px 10px', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }
const btnGhost   = { padding: '7px 10px', background: '#f1f5f9', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }

const DAY_W = 30   // column width px per day

// ─────────────────────────────────────────────────────────────
export default function TimesheetPage() {
  const qc = useQueryClient()
  const [year,  setYear]  = useState(THIS_YEAR)
  const [month, setMonth] = useState(THIS_MONTH)
  const [tab,   setTab]   = useState('office')     // 'office' | 'operator'
  const [popover, setPopover] = useState(null)     // { personnelId, date, equipmentName, entry, rect, isOperator }
  const popRef = useRef(null)

  const numDays = daysInMonth(year, month)

  // Close popover when clicking outside
  useEffect(() => {
    const fn = (e) => { if (popRef.current && !popRef.current.contains(e.target)) setPopover(null) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  // ── Data fetching ──────────────────────────────────────────
  const { data: entries = [], isLoading: loadingEntries } = useQuery({
    queryKey: ['timesheet', year, month],
    queryFn:  () => timesheetApi.list(year, month).then(r => r.data),
  })

  const { data: allPersonnel = [] } = useQuery({
    queryKey: ['personnel-all'],
    queryFn:  () => personnelApi.getAll().then(r => r.data),
  })

  // ── Build lookup map: `pid_day_equip` → entry ─────────────
  const entryMap = {}
  for (const e of entries) {
    const d = new Date(e.entry_date).getUTCDate()
    const key = `${e.personnel_id}_${d}_${e.equipment_name ?? '__office__'}`
    entryMap[key] = e
  }

  // Personnel grouped by timesheet_type
  const officePersonnel = allPersonnel.filter(p => !p.timesheet_type || p.timesheet_type === 'OFFICE')
  const operatorPersonnel = allPersonnel.filter(p => p.timesheet_type === 'OPERATOR')

  // Operator equipment rows: {pid, equip, info}
  const opEquipSet = new Map()  // `pid_equip` → {pid, equip, full_name, ...}
  for (const e of entries) {
    if (e.equipment_name) {
      const k = `${e.personnel_id}_${e.equipment_name}`
      if (!opEquipSet.has(k)) opEquipSet.set(k, { pid: e.personnel_id, equip: e.equipment_name, full_name: e.full_name, department_name: e.department_name })
    }
  }
  // Also add OPERATOR personnel with no entries
  for (const p of operatorPersonnel) {
    const k = `${p.id}_`
    if (![...opEquipSet.keys()].some(key => key.startsWith(p.id))) {
      opEquipSet.set(k, { pid: p.id, equip: '', full_name: p.full_name, department_name: '' })
    }
  }
  const opRows = [...opEquipSet.values()].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))

  // ── Mutations ──────────────────────────────────────────────
  const upsertMutation = useMutation({
    mutationFn: (data) => timesheetApi.upsertEntry(data),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['timesheet', year, month] }); setPopover(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => timesheetApi.deleteEntry(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['timesheet', year, month] }); setPopover(null) },
  })

  const setTypeMutation = useMutation({
    mutationFn: ({ id, type }) => timesheetApi.setPersonnelType(id, type),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['personnel-all'] }),
  })

  // ── Cell click ─────────────────────────────────────────────
  const openCell = (e, pid, day, equip, isOperator) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const key  = `${pid}_${day}_${equip ?? '__office__'}`
    setPopover({
      personnelId: pid, date: new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10),
      equipmentName: equip, entry: entryMap[key] || null, isOperator,
      style: {
        top:  Math.min(rect.bottom + 4, window.innerHeight - 320),
        left: Math.min(rect.left,        window.innerWidth  - 260),
      },
    })
  }

  const handleSaveOffice = (fields) => {
    if (!popover) return
    upsertMutation.mutate({
      personnel_id: popover.personnelId,
      entry_date:   popover.date,
      equipment_name: null,
      ...fields,
    })
  }

  const handleSaveOperator = (fields) => {
    if (!popover) return
    upsertMutation.mutate({
      personnel_id: popover.personnelId,
      entry_date:   popover.date,
      ...fields,
    })
  }

  const handleDelete = () => {
    if (popover?.entry?.id) deleteMutation.mutate(popover.entry.id)
  }

  // ── Summary totals ─────────────────────────────────────────
  const officeTotal = (pid) => {
    let days = 0, hrs = 0, ot = 0, leave = 0
    for (let d = 1; d <= numDays; d++) {
      const e = entryMap[`${pid}_${d}___office__`]
      if (e) {
        if (e.is_leave) { leave++ } else { days += parseFloat(e.work_days || 0); hrs += parseFloat(e.hours_regular || 0); ot += parseFloat(e.overtime_hours || 0) }
      }
    }
    return { days, hrs, ot, leave }
  }

  const opTotal = (pid, equip) => {
    let main = 0, sec = 0
    for (let d = 1; d <= numDays; d++) {
      const e = entryMap[`${pid}_${d}_${equip}`]
      if (e) { main += parseFloat(e.hours_main || 0); sec += parseFloat(e.hours_secondary || 0) }
    }
    return { main, sec }
  }

  const handleExport = async () => {
    try {
      const res = await timesheetApi.export(year, month)
      const url = URL.createObjectURL(res.data)
      const a   = document.createElement('a')
      a.href = url; a.download = `cham_cong_T${String(month).padStart(2,'0')}_${year}.xlsx`
      a.click(); URL.revokeObjectURL(url)
    } catch { alert('Export thất bại') }
  }

  // ── Render ─────────────────────────────────────────────────
  const cellBase = {
    width: DAY_W, minWidth: DAY_W, maxWidth: DAY_W,
    padding: '3px 2px', textAlign: 'center', fontSize: 11, cursor: 'pointer',
    border: '1px solid #e2e8f0', userSelect: 'none',
  }

  const dayHeaders = Array.from({ length: numDays }, (_, i) => i + 1)

  return (
    <div style={{ padding: '20px 24px', maxWidth: '100%' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#1a2744' }}>🗓️ Chấm công</h1>

        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 13 }}>
          {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>

        <select value={year} onChange={e => setYear(Number(e.target.value))}
          style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 13 }}>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <div style={{ flex: 1 }} />

        <button onClick={handleExport}
          style={{ padding: '8px 16px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          📥 Xuất Excel
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16 }}>
        {[
          { key: 'office',   label: '👨‍💼 Khối nhân sự chính' },
          { key: 'operator', label: '🚜 Khối vận hành' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '9px 20px', fontSize: 13, fontWeight: tab === t.key ? 700 : 400,
            color: tab === t.key ? 'white' : '#64748b',
            background: tab === t.key ? '#1a2744' : '#f1f5f9',
            border: 'none', borderRadius: 8, cursor: 'pointer',
          }}>{t.label}</button>
        ))}
      </div>

      {loadingEntries && <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>⏳ Đang tải...</div>}

      {/* ── OFFICE GRID ───────────────────────────────────── */}
      {!loadingEntries && tab === 'office' && (
        <div style={{ overflowX: 'auto', background: 'white', borderRadius: 10, border: '1px solid #e2e8f0' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 700 }}>
            <thead>
              <tr style={{ background: '#1a2744', color: 'white' }}>
                <th style={thFixed(36)}>STT</th>
                <th style={thFixed(160)}>Họ và tên</th>
                <th style={thFixed(110)}>Bộ phận</th>
                {dayHeaders.map(d => <th key={d} style={{ ...thDay, background: '#1a2744' }}>{d}</th>)}
                <th style={thSum}>Ngày công</th>
                <th style={thSum}>Giờ TT</th>
                <th style={thSum}>Tăng ca</th>
                <th style={thSum}>Nghỉ phép</th>
                <th style={{ ...thSum, cursor: 'default' }}>TC&gt;2h</th>
              </tr>
            </thead>
            <tbody>
              {officePersonnel.map((p, idx) => {
                const { days, hrs, ot, leave } = officeTotal(p.id)
                const ot2hCount = Array.from({ length: numDays }, (_, i) => i + 1)
                  .filter(d => entryMap[`${p.id}_${d}___office__`]?.overtime_over_2h).length
                return (
                  <tr key={p.id} style={{ background: idx % 2 === 0 ? 'white' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    <td style={tdFixed(36, true)}>{idx + 1}</td>
                    <td style={tdFixed(160)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.full_name}</span>
                        <button
                          title="Chuyển sang Vận hành"
                          onClick={() => setTypeMutation.mutate({ id: p.id, type: 'OPERATOR' })}
                          style={{ fontSize: 9, padding: '1px 4px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 3, cursor: 'pointer', color: '#64748b', flexShrink: 0 }}>
                          🚜
                        </button>
                      </div>
                    </td>
                    <td style={tdFixed(110, false, true)}>{p.department_name || '—'}</td>
                    {dayHeaders.map(d => {
                      const e = entryMap[`${p.id}_${d}___office__`]
                      let bg = 'transparent', label = ''
                      if (e) {
                        if (e.is_leave) { bg = '#fef3c7'; label = 'NP' }
                        else {
                          const ot = parseFloat(e.overtime_hours || 0)
                          bg = ot > 0 ? '#dcfce7' : '#f0f9ff'
                          const h = parseFloat(e.hours_regular || 0)
                          label = ot > 0 ? `${h}+${ot}` : String(h || '')
                        }
                      }
                      return (
                        <td key={d} onClick={ev => openCell(ev, p.id, d, null, false)}
                          style={{ ...cellBase, background: bg, verticalAlign: 'middle', color: '#1a2744', fontWeight: e ? 600 : 400 }}>
                          {label}
                        </td>
                      )
                    })}
                    <td style={tdSum}>{days > 0 ? days : ''}</td>
                    <td style={tdSum}>{hrs  > 0 ? hrs  : ''}</td>
                    <td style={{ ...tdSum, color: ot > 0 ? '#16a34a' : undefined }}>{ot > 0 ? ot : ''}</td>
                    <td style={{ ...tdSum, color: leave > 0 ? '#f59e0b' : undefined }}>{leave > 0 ? leave : ''}</td>
                    <td style={{ ...tdSum, color: ot2hCount > 0 ? '#3b82f6' : undefined }}>{ot2hCount > 0 ? ot2hCount : ''}</td>
                  </tr>
                )
              })}
              {officePersonnel.length === 0 && (
                <tr><td colSpan={3 + numDays + 5} style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>
                  Chưa có nhân viên nào trong khối nhân sự chính
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── OPERATOR GRID ─────────────────────────────────── */}
      {!loadingEntries && tab === 'operator' && (
        <div style={{ overflowX: 'auto', background: 'white', borderRadius: 10, border: '1px solid #e2e8f0' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 700 }}>
            <thead>
              <tr style={{ background: '#1a2744', color: 'white' }}>
                <th style={thFixed(36)}>STT</th>
                <th style={thFixed(150)}>Họ và tên</th>
                <th style={thFixed(160)}>Thiết bị</th>
                <th style={{ ...thDay, background: '#1a2744', width: 36, minWidth: 36 }}>Loại</th>
                {dayHeaders.map(d => <th key={d} style={{ ...thDay, background: '#1a2744' }}>{d}</th>)}
                <th style={thSum}>T.Chính</th>
                <th style={thSum}>T.Phụ</th>
                <th style={thSum}>Tổng</th>
              </tr>
            </thead>
            <tbody>
              {opRows.map(({ pid, equip, full_name, department_name }, idx) => {
                const { main, sec } = opTotal(pid, equip)
                return [
                  // Row 1: Việc chính
                  <tr key={`${pid}_${equip}_main`} style={{ borderBottom: '1px solid #f8fafc', background: idx % 2 === 0 ? 'white' : '#f8fafc' }}>
                    <td style={{ ...tdFixed(36, true), rowSpan: 1 }}>{idx + 1}</td>
                    <td style={tdFixed(150)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{full_name}</span>
                        <button
                          title="Chuyển sang Nhân sự"
                          onClick={() => setTypeMutation.mutate({ id: pid, type: 'OFFICE' })}
                          style={{ fontSize: 9, padding: '1px 4px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 3, cursor: 'pointer', color: '#64748b', flexShrink: 0 }}>
                          👤
                        </button>
                      </div>
                    </td>
                    <td style={tdFixed(160, false, true)}>{equip || <span style={{ color: '#94a3b8' }}>Chưa có thiết bị</span>}</td>
                    <td style={{ ...cellBase, background: '#eff6ff', fontWeight: 600, color: '#1d4ed8', cursor: 'default' }}>Chính</td>
                    {dayHeaders.map(d => {
                      const e = entryMap[`${pid}_${d}_${equip}`]
                      const m = e ? parseFloat(e.hours_main || 0) : 0
                      return (
                        <td key={d} onClick={ev => openCell(ev, pid, d, equip || null, true)}
                          style={{ ...cellBase, background: m > 0 ? '#f0f9ff' : 'transparent', color: '#1a2744', fontWeight: m > 0 ? 600 : 400 }}>
                          {m > 0 ? m : ''}
                        </td>
                      )
                    })}
                    <td style={tdSum}>{main > 0 ? main : ''}</td>
                    <td style={tdSum}></td>
                    <td style={tdSum}></td>
                  </tr>,
                  // Row 2: Việc phụ
                  <tr key={`${pid}_${equip}_sec`} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#fafafa' : '#f4f6fa' }}>
                    <td style={tdFixed(36, true, false, '#f4f6fa')}></td>
                    <td style={{ ...tdFixed(150), background: 'transparent' }}></td>
                    <td style={{ ...tdFixed(160, false, true), background: 'transparent' }}></td>
                    <td style={{ ...cellBase, background: '#f0fdf4', fontWeight: 600, color: '#16a34a', cursor: 'default' }}>Phụ</td>
                    {dayHeaders.map(d => {
                      const e = entryMap[`${pid}_${d}_${equip}`]
                      const s = e ? parseFloat(e.hours_secondary || 0) : 0
                      return (
                        <td key={d} onClick={ev => openCell(ev, pid, d, equip || null, true)}
                          style={{ ...cellBase, background: s > 0 ? '#f0fdf4' : 'transparent', color: '#1a2744', fontWeight: s > 0 ? 600 : 400 }}>
                          {s > 0 ? s : ''}
                        </td>
                      )
                    })}
                    <td style={tdSum}></td>
                    <td style={{ ...tdSum, color: '#16a34a' }}>{sec > 0 ? sec : ''}</td>
                    <td style={{ ...tdSum, fontWeight: 700 }}>{(main + sec) > 0 ? (main + sec) : ''}</td>
                  </tr>,
                ]
              })}
              {opRows.length === 0 && (
                <tr><td colSpan={4 + numDays + 3} style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>
                  Chưa có nhân viên nào trong khối vận hành
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, color: '#64748b' }}>
        <span style={{ background: '#fef3c7', padding: '2px 8px', borderRadius: 4 }}>NP = Nghỉ phép</span>
        <span style={{ background: '#dcfce7', padding: '2px 8px', borderRadius: 4 }}>Xanh = Có tăng ca</span>
        <span style={{ background: '#f0f9ff', padding: '2px 8px', borderRadius: 4 }}>Xanh nhạt = Có công</span>
        <span>Click vào ô để nhập/sửa | 🚜👤 để chuyển nhóm chấm công</span>
      </div>

      {/* Popover */}
      {popover && (
        <div ref={popRef}>
          {popover.isOperator ? (
            <OperatorPopover
              entry={popover.entry}
              style={popover.style}
              onSave={handleSaveOperator}
              onDelete={handleDelete}
              onClose={() => setPopover(null)}
            />
          ) : (
            <OfficePopover
              entry={popover.entry}
              style={popover.style}
              onSave={handleSaveOffice}
              onDelete={handleDelete}
              onClose={() => setPopover(null)}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Table cell styles ────────────────────────────────────────
const thFixed = (w) => ({
  padding: '8px 10px', textAlign: 'left', fontWeight: 700, fontSize: 11,
  width: w, minWidth: w, maxWidth: w, position: 'sticky', left: 0,
  whiteSpace: 'nowrap',
})
const thDay = {
  width: DAY_W, minWidth: DAY_W, maxWidth: DAY_W,
  padding: '8px 2px', textAlign: 'center', fontWeight: 700, fontSize: 11,
}
const thSum = {
  width: 64, minWidth: 64, padding: '8px 6px', textAlign: 'center', fontWeight: 700, fontSize: 11,
  background: '#0f172a', cursor: 'default',
}
const tdFixed = (w, center = false, italic = false, bg) => ({
  padding: '5px 8px', textAlign: center ? 'center' : 'left',
  width: w, minWidth: w, maxWidth: w,
  fontStyle: italic ? 'italic' : 'normal',
  color: '#475569', fontSize: 11,
  border: '1px solid #e2e8f0',
  background: bg || undefined,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
})
const tdSum = {
  padding: '5px 6px', textAlign: 'center', fontWeight: 600, fontSize: 12,
  border: '1px solid #e2e8f0', background: '#f8fafc',
}
