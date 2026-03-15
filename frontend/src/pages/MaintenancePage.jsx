import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { maintenanceApi, assetApi } from '../services/api'
import { Card, PageHeader, StatusBadge, Btn, fmtVnd, fmtDate, Spinner } from '../components/ui'
import toast from 'react-hot-toast'

const TYPE_MAP = {
  SCHEDULED:   { label: 'Bảo dưỡng định kỳ',       color: '#3b82f6' },
  PREVENTIVE:  { label: 'Bảo dưỡng phòng ngừa',    color: '#10b981' },
  CORRECTIVE:  { label: 'Sửa chữa hỏng hóc',        color: '#ef4444' },
  EMERGENCY:   { label: 'Sửa chữa khẩn cấp',        color: '#f59e0b' },
  OVERHAUL:    { label: 'Đại tu / Phục hồi',         color: '#dc2626' },
  INSPECTION:  { label: 'Kiểm định / Đăng kiểm',    color: '#8b5cf6' },
  CALIBRATION: { label: 'Hiệu chuẩn thiết bị',      color: '#06b6d4' },
  LUBRICATION: { label: 'Tra dầu / Bảo dưỡng nhỏ', color: '#84cc16' },
}

// Preset field templates per equipment category
const FIELD_PRESETS = [
  {
    label: 'Xe cơ giới',
    fields: [
      { key: 'km_odometer',     label: 'Số km (odometer)' },
      { key: 'tinh_trang_lop',  label: 'Tình trạng lốp' },
      { key: 'muc_dau_nhot',    label: 'Mức dầu nhớt' },
      { key: 'kiem_dinh_expiry',label: 'Hạn đăng kiểm tiếp theo' },
    ],
  },
  {
    label: 'Máy móc / Thiết bị nặng',
    fields: [
      { key: 'gio_may',           label: 'Giờ máy (hours)' },
      { key: 'nhiet_do',          label: 'Nhiệt độ vận hành (°C)' },
      { key: 'ap_suat',           label: 'Áp suất (bar)' },
      { key: 'tinh_trang_day_dai',label: 'Tình trạng dây đai / xích' },
    ],
  },
  {
    label: 'Thiết bị đo lường',
    fields: [
      { key: 'so_chung_chi',      label: 'Số chứng chỉ hiệu chuẩn' },
      { key: 'han_hieu_chuan',    label: 'Hạn hiệu chuẩn tiếp theo' },
      { key: 'don_vi_hieu_chuan', label: 'Đơn vị thực hiện hiệu chuẩn' },
      { key: 'sai_so_cho_phep',   label: 'Sai số cho phép' },
    ],
  },
  {
    label: 'Thiết bị CNTT',
    fields: [
      { key: 'so_seri',          label: 'Số serial' },
      { key: 'phien_ban_os',     label: 'Phiên bản OS / firmware' },
      { key: 'tinh_trang_pin',   label: 'Sức khỏe pin (%)' },
      { key: 'update_cuoi',      label: 'Lần cập nhật cuối' },
    ],
  },
  {
    label: 'Hệ thống lạnh / điện lạnh',
    fields: [
      { key: 'ap_suat_gas',      label: 'Áp suất gas (bar)' },
      { key: 'nhiet_do_lanh',    label: 'Nhiệt độ làm lạnh (°C)' },
      { key: 'dong_dien',        label: 'Dòng điện tiêu thụ (A)' },
      { key: 'tinh_trang_loc',   label: 'Tình trạng lọc / phin' },
    ],
  },
]

const inp  = { width: '100%', padding: '8px 11px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }
const area = { ...inp, height: 72, resize: 'vertical' }
const lbl  = { fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }

function TypeBadge({ type }) {
  const m = TYPE_MAP[type] || { label: type, color: '#64748b' }
  return (
    <span style={{ background: m.color + '1a', color: m.color, padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
      {m.label}
    </span>
  )
}

// ── Dynamic key-value field editor ────────────────────────────────────────────
function KVEditor({ value, onChange, label }) {
  // value is array of {key, val}
  const add = () => onChange([...value, { key: '', val: '' }])
  const remove = i => onChange(value.filter((_, j) => j !== i))
  const set = (i, field, v) => onChange(value.map((row, j) => j === i ? { ...row, [field]: v } : row))

  const applyPreset = preset => {
    const existing = new Set(value.map(r => r.key))
    const toAdd = preset.fields.filter(f => !existing.has(f.key)).map(f => ({ key: f.key, val: '' }))
    onChange([...value, ...toAdd])
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <label style={lbl}>{label}</label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select defaultValue="" onChange={e => { if (e.target.value !== '') applyPreset(FIELD_PRESETS[+e.target.value]); e.target.value = '' }}
            style={{ fontSize: 11, padding: '3px 7px', borderRadius: 5, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer' }}>
            <option value="">+ Chọn mẫu thiết bị</option>
            {FIELD_PRESETS.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
          </select>
          <button onClick={add} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 5, border: '1px solid #10b981', background: '#f0fdf4', color: '#10b981', cursor: 'pointer' }}>+ Thêm</button>
        </div>
      </div>
      {value.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>Chọn mẫu thiết bị hoặc thêm thông số thủ công</div>
      ) : value.map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input value={row.key} onChange={e => set(i, 'key', e.target.value)}
            placeholder="Tên thông số (VD: gio_may)"
            style={{ ...inp, flex: '0 0 40%' }} />
          <input value={row.val} onChange={e => set(i, 'val', e.target.value)}
            placeholder="Giá trị"
            style={{ ...inp, flex: 1 }} />
          <button onClick={() => remove(i)} style={{ padding: '0 9px', border: '1px solid #fecaca', borderRadius: 6, background: 'white', color: '#ef4444', cursor: 'pointer', flexShrink: 0 }}>✕</button>
        </div>
      ))}
    </div>
  )
}

function kvToObj(rows) {
  if (!rows.length) return null
  const obj = {}
  for (const r of rows) { if (r.key.trim()) obj[r.key.trim()] = r.val }
  return Object.keys(obj).length ? obj : null
}

function objToKv(obj) {
  if (!obj || typeof obj !== 'object') return []
  return Object.entries(obj).map(([key, val]) => ({ key, val: String(val) }))
}

// ── Asset search input ────────────────────────────────────────────────────────
function AssetSearch({ value, onChange }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)

  const { data } = useQuery({
    queryKey: ['assets-search-maint', q],
    queryFn: () => assetApi.list({ q, size: 10 }).then(r => r.data?.items || []),
    enabled: q.length >= 1,
  })

  return (
    <div style={{ position: 'relative' }}>
      {value ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ flex: 1, padding: '8px 11px', borderRadius: 7, border: '1px solid #10b981', background: '#f0fdf4', fontSize: 13 }}>
            <strong>{value.asset_code}</strong> — {value.name}
          </div>
          <button onClick={() => onChange(null)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 12 }}>✕</button>
        </div>
      ) : (
        <>
          <input value={q} onChange={e => { setQ(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder="Nhập mã hoặc tên tài sản..." style={inp} autoFocus />
          {open && (data || []).length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 200, maxHeight: 220, overflowY: 'auto' }}>
              {(data || []).map(a => (
                <div key={a.id} onClick={() => { onChange(a); setOpen(false); setQ('') }}
                  style={{ padding: '9px 13px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f8fafc' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                  <span style={{ fontWeight: 700, color: '#1a2744' }}>{a.asset_code}</span>
                  <span style={{ marginLeft: 8, color: '#475569' }}>{a.name}</span>
                  <span style={{ marginLeft: 8, fontSize: 11, color: '#94a3b8' }}>{a.status}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
function DetailModal({ record, onClose }) {
  const statusColor = { PENDING: '#f59e0b', IN_PROGRESS: '#3b82f6', COMPLETED: '#10b981', CANCELLED: '#94a3b8' }
  const sc = statusColor[record.status] || '#64748b'

  const InfoRow = ({ label, value, highlight }) => value ? (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f8fafc', fontSize: 13, gap: 12 }}>
      <span style={{ color: '#64748b', flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 600, color: highlight ? '#2563eb' : '#1a2744', textAlign: 'right' }}>{value}</span>
    </div>
  ) : null

  const KVDisplay = ({ obj, title }) => {
    if (!obj || !Object.keys(obj).length) return null
    return (
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</div>
        <div style={{ background: '#f8fafc', borderRadius: 8, overflow: 'hidden' }}>
          {Object.entries(obj).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
              <span style={{ color: '#64748b' }}>{k}</span>
              <span style={{ fontWeight: 600 }}>{String(v)}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'white', borderRadius: 14, width: 600, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#1a2744', marginBottom: 4 }}>
                {record.asset_code} — {record.asset_name}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <TypeBadge type={record.maintenance_type} />
                <span style={{ background: sc + '1a', color: sc, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                  {record.status}
                </span>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8', padding: 0 }}>×</button>
          </div>
        </div>

        <div style={{ padding: '16px 24px 24px' }}>
          {/* Two-column layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>
            {/* Left: Schedule */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Lịch trình</div>
              <InfoRow label="Ngày dự kiến"   value={fmtDate(record.scheduled_date)} />
              <InfoRow label="Ngày bắt đầu"   value={fmtDate(record.start_date)} />
              <InfoRow label="Ngày hoàn thành" value={fmtDate(record.completion_date)} highlight />
              <InfoRow label="Tạo ngày"        value={fmtDate(record.created_at)} />
            </div>
            {/* Right: Execution */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Thực hiện</div>
              <InfoRow label="Đơn vị sửa chữa" value={record.service_provider} />
              <InfoRow label="Kỹ thuật viên"   value={record.technician_name} />
              <InfoRow label="Chi phí"          value={record.cost ? fmtVnd(record.cost) : null} highlight />
            </div>
          </div>

          {/* Issue description */}
          {record.issue_description && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Mô tả sự cố / lý do</div>
              <div style={{ background: '#fef9e7', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#78350f', lineHeight: 1.6 }}>
                {record.issue_description}
              </div>
            </div>
          )}

          {/* Technical readings before/after */}
          <KVDisplay obj={record.meter_reading_before} title="Thông số thiết bị trước bảo trì" />
          <KVDisplay obj={record.meter_reading_after}  title="Thông số thiết bị sau bảo trì" />

          {/* Work performed */}
          {record.work_performed && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Công việc đã thực hiện</div>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#166534', lineHeight: 1.6 }}>
                {record.work_performed}
              </div>
            </div>
          )}

          {/* Parts replaced */}
          {record.parts_replaced && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Linh kiện / vật tư thay thế</div>
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: '9px 12px', fontSize: 13, color: '#1a2744' }}>
                {record.parts_replaced}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Create Modal ──────────────────────────────────────────────────────────────
function CreateModal({ onClose, onSave }) {
  const [asset, setAsset] = useState(null)
  const [form, setForm] = useState({
    maintenance_type: 'SCHEDULED',
    service_provider: '',
    technician_name: '',
    scheduled_date: '',
    issue_description: '',
    cost: '',
  })
  const [kvBefore, setKvBefore] = useState([])
  const [err, setErr] = useState('')
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const { mutate, isPending } = useMutation({
    mutationFn: (data) => maintenanceApi.create(data),
    onSuccess: () => { toast.success('Đã tạo phiếu bảo trì!'); onSave() },
    onError: (e) => setErr(e.response?.data?.detail || e.message),
  })

  const submit = () => {
    if (!asset) { setErr('Vui lòng chọn tài sản'); return }
    setErr('')
    mutate({
      asset_id: asset.id,
      maintenance_type: form.maintenance_type,
      service_provider:  form.service_provider  || null,
      technician_name:   form.technician_name   || null,
      scheduled_date:    form.scheduled_date     || null,
      issue_description: form.issue_description  || null,
      cost:              form.cost ? parseFloat(form.cost) : null,
      meter_reading_before: kvToObj(kvBefore),
    })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'white', borderRadius: 14, width: 580, padding: 28, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 20 }}>Tạo phiếu bảo trì</div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Tài sản *</label>
          <AssetSearch value={asset} onChange={setAsset} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={lbl}>Loại bảo trì *</label>
            <select value={form.maintenance_type} onChange={e => set('maintenance_type', e.target.value)}
              style={{ ...inp, background: 'white' }}>
              {Object.entries(TYPE_MAP).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Ngày dự kiến</label>
            <input type="date" value={form.scheduled_date} onChange={e => set('scheduled_date', e.target.value)} style={inp} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={lbl}>Đơn vị sửa chữa</label>
            <input value={form.service_provider} onChange={e => set('service_provider', e.target.value)} style={inp} placeholder="Tên cơ sở / công ty" />
          </div>
          <div>
            <label style={lbl}>Kỹ thuật viên</label>
            <input value={form.technician_name} onChange={e => set('technician_name', e.target.value)} style={inp} placeholder="Tên KTV phụ trách" />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Chi phí dự kiến (VND)</label>
          <input type="number" value={form.cost} onChange={e => set('cost', e.target.value)} style={{ ...inp, width: '50%' }} placeholder="0" />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Mô tả sự cố / lý do bảo trì</label>
          <textarea value={form.issue_description} onChange={e => set('issue_description', e.target.value)} style={area} />
        </div>

        {/* Dynamic equipment fields */}
        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14, marginBottom: 18 }}>
          <KVEditor
            label="Thông số thiết bị trước bảo trì"
            value={kvBefore}
            onChange={setKvBefore}
          />
        </div>

        {err && <div style={{ color: '#b91c1c', fontSize: 12, marginBottom: 12, background: '#fef2f2', padding: '8px 10px', borderRadius: 6 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={submit} disabled={isPending}
            style={{ padding: '9px 22px', background: '#1a2744', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
            {isPending ? '...' : 'Tạo phiếu'}
          </button>
          <button onClick={onClose}
            style={{ padding: '9px 16px', background: '#f1f5f9', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13 }}>Huỷ</button>
        </div>
      </div>
    </div>
  )
}

// ── Complete Modal ────────────────────────────────────────────────────────────
function CompleteModal({ record, onClose, onSave }) {
  const [form, setForm] = useState({
    completion_date: new Date().toISOString().slice(0, 10),
    work_performed: '',
    parts_replaced: '',
    cost: record.cost ? String(record.cost) : '',
  })
  const [kvAfter, setKvAfter] = useState(objToKv(record.meter_reading_before))
  const [err, setErr] = useState('')
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const { mutate, isPending } = useMutation({
    mutationFn: (data) => maintenanceApi.complete(record.id, data),
    onSuccess: () => { toast.success('Hoàn thành bảo trì!'); onSave() },
    onError: (e) => setErr(e.response?.data?.detail || e.message),
  })

  const submit = () => {
    if (!form.completion_date || !form.work_performed.trim()) {
      setErr('Vui lòng nhập ngày hoàn thành và công việc đã thực hiện')
      return
    }
    setErr('')
    mutate({
      completion_date:    form.completion_date,
      work_performed:     form.work_performed,
      parts_replaced:     form.parts_replaced || null,
      cost:               form.cost ? parseFloat(form.cost) : null,
      meter_reading_after: kvToObj(kvAfter),
    })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'white', borderRadius: 14, width: 560, padding: 28, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 4 }}>Hoàn thành bảo trì</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
          {record.asset_code} — {record.asset_name} &nbsp;|&nbsp; <TypeBadge type={record.maintenance_type} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={lbl}>Ngày hoàn thành *</label>
            <input type="date" value={form.completion_date} onChange={e => set('completion_date', e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Chi phí thực tế (VND)</label>
            <input type="number" value={form.cost} onChange={e => set('cost', e.target.value)} style={inp} placeholder="0" />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Công việc đã thực hiện *</label>
          <textarea value={form.work_performed} onChange={e => set('work_performed', e.target.value)} style={{ ...area, height: 80 }}
            placeholder="Mô tả chi tiết công việc sửa chữa / bảo dưỡng đã làm..." />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Linh kiện / vật tư thay thế</label>
          <input value={form.parts_replaced} onChange={e => set('parts_replaced', e.target.value)} style={inp} placeholder="VD: Thay dầu động cơ 5W-30, lọc gió, bugi..." />
        </div>

        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14, marginBottom: 18 }}>
          <KVEditor
            label="Thông số thiết bị sau bảo trì"
            value={kvAfter}
            onChange={setKvAfter}
          />
        </div>

        {err && <div style={{ color: '#b91c1c', fontSize: 12, marginBottom: 12, background: '#fef2f2', padding: '8px 10px', borderRadius: 6 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={submit} disabled={isPending}
            style={{ padding: '9px 22px', background: '#10b981', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
            {isPending ? '...' : 'Xác nhận hoàn thành'}
          </button>
          <button onClick={onClose}
            style={{ padding: '9px 16px', background: '#f1f5f9', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13 }}>Huỷ</button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MaintenancePage() {
  const qc = useQueryClient()
  const [filterStatus, setFilterStatus] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [completing, setCompleting] = useState(null)
  const [viewing, setViewing]       = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['maintenance', filterStatus],
    queryFn: () => maintenanceApi.list({ status: filterStatus || undefined, size: 50 }).then(r => r.data),
  })
  const records = Array.isArray(data) ? data : []

  const cancelMutation = useMutation({
    mutationFn: (id) => maintenanceApi.cancel(id),
    onSuccess: () => { toast.success('Đã huỷ phiếu'); qc.invalidateQueries(['maintenance']) },
    onError: (e) => toast.error(e.response?.data?.detail || e.message),
  })

  const invalidate = () => qc.invalidateQueries(['maintenance'])

  const counts = {
    pending:   records.filter(r => r.status === 'PENDING').length,
    progress:  records.filter(r => r.status === 'IN_PROGRESS').length,
    completed: records.filter(r => r.status === 'COMPLETED').length,
    cancelled: records.filter(r => r.status === 'CANCELLED').length,
  }

  return (
    <div>
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onSave={() => { setShowCreate(false); invalidate() }} />}
      {completing  && <CompleteModal record={completing} onClose={() => setCompleting(null)} onSave={() => { setCompleting(null); invalidate() }} />}
      {viewing     && <DetailModal record={viewing} onClose={() => setViewing(null)} />}

      <PageHeader
        title="Bảo trì & Sửa chữa"
        actions={<Btn variant="primary" onClick={() => setShowCreate(true)}>+ Tạo phiếu</Btn>}
      />

      <div style={{ padding: 24 }}>
        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Chờ xử lý',      count: counts.pending,   color: '#f59e0b' },
            { label: 'Đang thực hiện',  count: counts.progress,  color: '#3b82f6' },
            { label: 'Hoàn thành',      count: counts.completed, color: '#10b981' },
            { label: 'Đã huỷ',          count: counts.cancelled, color: '#94a3b8' },
          ].map(s => (
            <Card key={s.label} style={{ textAlign: 'center', padding: '14px 12px' }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: s.color }}>{s.count}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{s.label}</div>
            </Card>
          ))}
        </div>

        {/* Filter */}
        <div style={{ marginBottom: 14 }}>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'white' }}>
            <option value="">Tất cả trạng thái</option>
            <option value="PENDING">Chờ xử lý</option>
            <option value="IN_PROGRESS">Đang thực hiện</option>
            <option value="COMPLETED">Hoàn thành</option>
            <option value="CANCELLED">Đã huỷ</option>
          </select>
        </div>

        {/* Table */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {isLoading ? <Spinner /> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Tài sản', 'Loại bảo trì', 'Đơn vị thực hiện', 'Lịch / Hoàn thành', 'Chi phí', 'Trạng thái', 'Thao tác'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Chưa có phiếu bảo trì nào</td></tr>
                ) : records.map(r => {
                  const isDone = r.status === 'COMPLETED' || r.status === 'CANCELLED'
                  const hasReadings = r.meter_reading_before && Object.keys(r.meter_reading_before).length > 0
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 700, color: '#1a2744' }}>{r.asset_code || '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{r.asset_name || '—'}</div>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <TypeBadge type={r.maintenance_type} />
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--muted)' }}>
                        <div>{r.service_provider || '—'}</div>
                        {r.technician_name && <div style={{ fontSize: 11, marginTop: 2 }}>{r.technician_name}</div>}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12 }}>
                        {r.completion_date
                          ? <span style={{ color: '#10b981', fontWeight: 600 }}>{fmtDate(r.completion_date)}</span>
                          : <span style={{ color: 'var(--muted)' }}>{fmtDate(r.scheduled_date) || '—'}</span>}
                        {hasReadings && (
                          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                            {Object.keys(r.meter_reading_before).length} thông số
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: r.cost ? 700 : 400, color: r.cost ? '#1a2744' : 'var(--muted)' }}>
                        {r.cost ? fmtVnd(r.cost) : '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}><StatusBadge status={r.status} /></td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          <Btn variant="ghost" size="sm" onClick={() => setViewing(r)}>Chi tiết</Btn>
                          {!isDone && (
                            <Btn variant="primary" size="sm" onClick={() => setCompleting(r)}>Hoàn thành</Btn>
                          )}
                          {!isDone && (
                            <Btn variant="outline" size="sm"
                              style={{ color: '#dc2626', borderColor: '#fecaca' }}
                              onClick={() => window.confirm('Huỷ phiếu bảo trì này?') && cancelMutation.mutate(r.id)}>
                              Huỷ
                            </Btn>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  )
}
