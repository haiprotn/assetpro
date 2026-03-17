import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { lifecycleApi, assetApi } from '../services/api'
import { Card, PageHeader, Spinner, Btn } from '../components/ui'

// ── Cấu hình sự kiện ─────────────────────────────────────────────────────────
const EVENT_CFG = {
  CREATED:               { icon: '➕', color: '#10b981', bg: '#dcfce7', label: 'Tạo mới' },
  TRANSFERRED:           { icon: '🔄', color: '#1d4ed8', bg: '#dbeafe', label: 'Điều chuyển' },
  QR_SCANNED:            { icon: '📱', color: '#d97706', bg: '#fef3c7', label: 'Xác nhận QR' },
  ALLOCATED:             { icon: '📤', color: '#3b82f6', bg: '#dbeafe', label: 'Cấp phát' },
  RECOVERED:             { icon: '📥', color: '#7c3aed', bg: '#ede9fe', label: 'Thu hồi' },
  MAINTENANCE_STARTED:   { icon: '🔧', color: '#c2410c', bg: '#ffedd5', label: 'Bắt đầu bảo trì' },
  MAINTENANCE_COMPLETED: { icon: '✅', color: '#15803d', bg: '#dcfce7', label: 'Hoàn thành bảo trì' },
  LIQUIDATED:            { icon: '🗑️', color: '#b91c1c', bg: '#fee2e2', label: 'Thanh lý' },
  STATUS_CHANGED:        { icon: '🔁', color: '#475569', bg: '#f1f5f9', label: 'Đổi trạng thái' },
  LOCATION_CHANGED:      { icon: '📍', color: '#0369a1', bg: '#f0f9ff', label: 'Đổi vị trí' },
  ATTRIBUTE_UPDATED:     { icon: '✏️', color: '#64748b', bg: '#f8fafc', label: 'Cập nhật thông tin' },
}

const FIELD_VI = {
  status: 'Trạng thái', location_id: 'Vị trí', department_id: 'Phòng ban',
  personnel_id: 'Nhân sự phụ trách', asset_type_id: 'Loại tài sản',
  purchase_date: 'Ngày mua', purchase_price: 'Giá mua', warranty_expiry: 'Hạn bảo hành',
  name: 'Tên tài sản', asset_code: 'Mã tài sản', serial_number: 'Số serial',
  barcode: 'Mã vạch', notes: 'Ghi chú', condition: 'Tình trạng', quantity: 'Số lượng',
  from_location_id: 'Vị trí đi', to_location_id: 'Vị trí đến',
  from_department_id: 'Phòng ban đi', to_department_id: 'Phòng ban đến',
  supplier_id: 'Nhà cung cấp', managing_department_id: 'Phòng ban quản lý',
}

const STATUS_VI = {
  AVAILABLE: 'Sẵn sàng', IN_USE: 'Đang sử dụng', UNDER_MAINTENANCE: 'Đang bảo trì',
  RETIRED: 'Đã thanh lý', LOST: 'Mất / Thất lạc', DAMAGED: 'Hỏng hóc',
  STORED: 'Đang lưu kho', PENDING: 'Chờ xử lý', APPROVED: 'Đã duyệt',
  IN_TRANSIT: 'Đang vận chuyển', COMPLETED: 'Hoàn thành', CANCELLED: 'Đã huỷ',
  REJECTED: 'Từ chối', DRAFT: 'Nháp', ALLOCATED: 'Đã cấp phát',
}

const fieldLabel  = k => FIELD_VI[k]  || k
const statusLabel = v => (typeof v === 'string' && STATUS_VI[v]) ? STATUS_VI[v] : v

// Các trường không cần hiển thị trong diff
const SKIP_DIFF_FIELDS = new Set(['updated_at', 'created_at', 'dynamic_attributes', 'id'])

// Dịch event_description từ backend sang tiếng Việt
function translateDescription(text) {
  if (!text) return text
  // "Status changed: A → B"
  const m = text.match(/Status changed:\s*(\w+)\s*[→\->]+\s*(\w+)/i)
  if (m) {
    const from = STATUS_VI[m[1]] || m[1]
    const to   = STATUS_VI[m[2]] || m[2]
    return `Trạng thái thay đổi: ${from} → ${to}`
  }
  return text
}

const fmtTime = d => new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
const fmtDate = d => new Date(d).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
const fmtFull = d => new Date(d).toLocaleString('vi-VN', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

// ── Thay đổi trước → sau ─────────────────────────────────────────────────────
function safeVal(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'object') return null  // bỏ qua object phức tạp
  const s = String(v)
  return statusLabel(s)
}

function DiffBadges({ prev, next }) {
  if (!prev && !next) return null
  const keys = Array.from(new Set([...Object.keys(prev || {}), ...Object.keys(next || {})]))
    .filter(k => !SKIP_DIFF_FIELDS.has(k))
  const changed = keys.filter(k => {
    const a = prev?.[k], b = next?.[k]
    if (typeof a === 'object' || typeof b === 'object') return false
    return a !== b
  })
  if (!changed.length) return null
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
      {changed.map(k => {
        const fromVal = safeVal(prev?.[k])
        const toVal   = safeVal(next?.[k])
        if (fromVal === null && toVal === null) return null
        return (
          <span key={k} style={{
            fontSize: 11, background: '#fff', border: '1px solid #e2e8f0',
            borderRadius: 6, padding: '3px 9px', color: '#475569',
            display: 'inline-flex', gap: 5, alignItems: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
          }}>
            <span style={{ color: '#94a3b8', fontWeight: 600 }}>{fieldLabel(k)}:</span>
            {fromVal !== null && (
              <span style={{ color: '#ef4444', textDecoration: 'line-through' }}>{fromVal}</span>
            )}
            <span style={{ color: '#cbd5e1' }}>→</span>
            {toVal !== null && (
              <span style={{ color: '#10b981', fontWeight: 700 }}>{toVal}</span>
            )}
          </span>
        )
      })}
    </div>
  )
}

// ── Modal chi tiết ────────────────────────────────────────────────────────────
function EventModal({ ev, onClose, navigate }) {
  const cfg = EVENT_CFG[ev.event_type] || { icon: '•', color: '#64748b', bg: '#f8fafc', label: ev.event_type }
  const hasChange = ev.previous_state || ev.new_state || Object.keys(ev.changed_fields || {}).length > 0

  const Row = ({ label, value, onClick }) => !value ? null : (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      padding: '8px 0', borderBottom: '1px solid #f8fafc', fontSize: 13, gap: 16
    }}>
      <span style={{ color: '#94a3b8', flexShrink: 0, minWidth: 130 }}>{label}</span>
      <span onClick={onClick} style={{
        fontWeight: 600, color: onClick ? '#2563eb' : '#1a2744',
        textAlign: 'right', cursor: onClick ? 'pointer' : 'default'
      }}>{value}</span>
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'white', borderRadius: 18, width: 540, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.22)' }}>

        {/* Header màu */}
        <div style={{ background: `linear-gradient(135deg, ${cfg.color}18, ${cfg.color}08)`, borderBottom: `2px solid ${cfg.color}30`, padding: '20px 24px 16px', borderRadius: '18px 18px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: cfg.bg, border: `2px solid ${cfg.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
              {cfg.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#1a2744' }}>{cfg.label}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{fmtFull(ev.created_at)}</div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#94a3b8', lineHeight: 1, padding: '0 4px' }}>×</button>
          </div>
        </div>

        <div style={{ padding: '18px 24px 24px' }}>
          {/* Thông tin */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Thông tin sự kiện</div>
            <Row label="Tài sản" value={ev.asset_code ? `${ev.asset_code}  —  ${ev.asset_name || ''}` : null}
              onClick={ev.asset_id ? () => { navigate(`/assets/${ev.asset_id}`); onClose() } : null} />
            <Row label="Người thực hiện" value={ev.performed_by_name} />
            <Row label="Từ vị trí" value={ev.from_location_name} />
            <Row label="Đến vị trí" value={ev.to_location_name} />
            <Row label="Phiếu điều chuyển" value={ev.transfer_order_code}
              onClick={ev.transfer_order_id ? () => { navigate(`/transfers/${ev.transfer_order_id}`); onClose() } : null} />
            <Row label="Tọa độ GPS" value={ev.gps_coordinates ? `${ev.gps_coordinates.lat?.toFixed(5)}, ${ev.gps_coordinates.lng?.toFixed(5)}` : null} />
          </div>

          {/* Mô tả */}
          {ev.event_description && (
            <div style={{ marginBottom: 16, background: '#f8fafc', borderRadius: 10, padding: '11px 14px', fontSize: 13, color: '#475569', lineHeight: 1.7, borderLeft: `3px solid ${cfg.color}` }}>
              {translateDescription(ev.event_description)}
            </div>
          )}

          {/* Thay đổi */}
          {hasChange && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Nội dung thay đổi</div>
              <DiffBadges prev={ev.previous_state} next={ev.new_state} />
              {ev.changed_fields && Object.keys(ev.changed_fields).length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {Object.entries(ev.changed_fields)
                    .filter(([k, v]) => !SKIP_DIFF_FIELDS.has(k) && typeof v !== 'object')
                    .map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', gap: 10, fontSize: 12, padding: '6px 10px', background: '#f8fafc', borderRadius: 7 }}>
                        <span style={{ color: '#94a3b8', minWidth: 140 }}>{fieldLabel(k)}</span>
                        <span style={{ color: '#1a2744', fontWeight: 600 }}>{statusLabel(String(v))}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Tìm tài sản ──────────────────────────────────────────────────────────────
function AssetFilter({ value, onChange }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const { data } = useQuery({
    queryKey: ['asset-lc-filter', q],
    queryFn: () => assetApi.list({ q, size: 8 }).then(r => r.data?.items || []),
    enabled: q.length >= 1,
  })
  return (
    <div style={{ position: 'relative' }}>
      {value ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #10b981', background: '#f0fdf4', fontSize: 13, fontWeight: 700, color: '#065f46' }}>
            {value.asset_code} — {value.name}
          </div>
          <button onClick={() => onChange(null)} style={{ padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', color: '#94a3b8', fontSize: 14 }}>✕</button>
        </div>
      ) : (
        <>
          <input value={q} onChange={e => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
            placeholder="Tìm theo tài sản..." style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, width: 200, outline: 'none' }} />
          {open && (data || []).length > 0 && (
            <div style={{ position: 'absolute', top: '110%', left: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 200, minWidth: 280 }}>
              {(data || []).map(a => (
                <div key={a.id} onClick={() => { onChange(a); setOpen(false); setQ('') }}
                  style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f8fafc' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                  <strong style={{ color: '#1a2744' }}>{a.asset_code}</strong>
                  <span style={{ marginLeft: 8, color: '#64748b', fontSize: 12 }}>{a.name}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Trang chính ───────────────────────────────────────────────────────────────
export default function LifecyclePage() {
  const navigate = useNavigate()
  const [filterType,  setFilterType]  = useState('')
  const [filterAsset, setFilterAsset] = useState(null)
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [page,        setPage]        = useState(1)
  const [viewing,     setViewing]     = useState(null)
  const SIZE = 40

  const params = {
    event_type: filterType      || undefined,
    asset_id:   filterAsset?.id || undefined,
    date_from:  dateFrom        || undefined,
    date_to:    dateTo          || undefined,
    page, size: SIZE,
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['lifecycle', params],
    queryFn: () => lifecycleApi.list(params).then(r => r.data),
    keepPreviousData: true,
  })

  const events     = data?.items || []
  const total      = data?.total || 0
  const totalPages = Math.ceil(total / SIZE)
  const resetPage  = () => setPage(1)

  const typeCounts = useMemo(() => {
    const map = {}
    for (const ev of events) map[ev.event_type] = (map[ev.event_type] || 0) + 1
    return map
  }, [events])

  const grouped = useMemo(() => {
    const acc = {}
    for (const ev of events) {
      const d = ev.created_at ? fmtDate(ev.created_at) : 'Không rõ ngày'
      if (!acc[d]) acc[d] = []
      acc[d].push(ev)
    }
    return acc
  }, [events])

  const hasFilter = filterType || filterAsset || dateFrom || dateTo
  const clearFilter = () => { setFilterType(''); setFilterAsset(null); setDateFrom(''); setDateTo(''); resetPage() }

  return (
    <div>
      {viewing && <EventModal ev={viewing} onClose={() => setViewing(null)} navigate={navigate} />}

      <PageHeader
        title="📋 Lịch sử hoạt động"
        subtitle={`${total.toLocaleString('vi-VN')} sự kiện đã ghi nhận${isFetching && !isLoading ? '  •  Đang tải...' : ''}`}
      />

      <div style={{ padding: '0 24px 24px' }}>

        {/* Bộ lọc */}
        <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px', marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 5 }}>Loại sự kiện</div>
              <select value={filterType} onChange={e => { setFilterType(e.target.value); resetPage() }}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'white', minWidth: 200, cursor: 'pointer' }}>
                <option value="">Tất cả loại sự kiện</option>
                {Object.entries(EVENT_CFG).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 5 }}>Tài sản</div>
              <AssetFilter value={filterAsset} onChange={a => { setFilterAsset(a); resetPage() }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 5 }}>Từ ngày</div>
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); resetPage() }}
                style={{ padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 5 }}>Đến ngày</div>
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); resetPage() }}
                style={{ padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }} />
            </div>
            {hasFilter && (
              <button onClick={clearFilter} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fff5f5', fontSize: 12, cursor: 'pointer', color: '#dc2626', fontWeight: 600, alignSelf: 'flex-end' }}>
                ✕ Xoá bộ lọc
              </button>
            )}
          </div>

          {/* Chip nhanh theo loại */}
          {events.length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f5f9', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#94a3b8', alignSelf: 'center', marginRight: 4 }}>Lọc nhanh:</span>
              {Object.entries(typeCounts).map(([type, count]) => {
                const cfg = EVENT_CFG[type] || { bg: '#f1f5f9', color: '#64748b', label: type }
                const active = filterType === type
                return (
                  <button key={type} onClick={() => { setFilterType(active ? '' : type); resetPage() }}
                    style={{
                      padding: '4px 11px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      background: active ? cfg.color : cfg.bg,
                      color: active ? 'white' : cfg.color,
                      border: `1px solid ${cfg.color}40`,
                      transition: 'all 0.15s',
                    }}>
                    {cfg.label} <span style={{ opacity: 0.75 }}>({count})</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Timeline */}
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div>
        ) : events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Không có sự kiện nào</div>
            <div style={{ fontSize: 13 }}>Thử thay đổi bộ lọc để xem kết quả khác</div>
          </div>
        ) : (
          <>
            {Object.entries(grouped).map(([day, dayEvents]) => (
              <div key={day} style={{ marginBottom: 28 }}>
                {/* Nhãn ngày */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1a2744', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#1a2744', whiteSpace: 'nowrap' }}>{day}</span>
                  <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, #e2e8f0, transparent)' }} />
                  <span style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' }}>
                    {dayEvents.length} sự kiện
                  </span>
                </div>

                {/* Danh sách sự kiện */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 20, position: 'relative' }}>
                  {/* Đường dọc timeline */}
                  <div style={{ position: 'absolute', left: 19, top: 0, bottom: 0, width: 2, background: 'linear-gradient(to bottom, #e2e8f0, transparent)', zIndex: 0 }} />

                  {dayEvents.map((ev) => {
                    const cfg = EVENT_CFG[ev.event_type] || { icon: '•', color: '#64748b', bg: '#f8fafc', label: ev.event_type }
                    const hasChanges = ev.previous_state || ev.new_state

                    return (
                      <div key={ev.id} style={{ position: 'relative', display: 'flex', gap: 14, zIndex: 1 }}>
                        {/* Dot + icon */}
                        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 12 }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 10, background: cfg.bg,
                            border: `2px solid ${cfg.color}50`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                          }}>
                            {cfg.icon}
                          </div>
                        </div>

                        {/* Card nội dung */}
                        <div onClick={() => setViewing(ev)} style={{
                          flex: 1, background: 'white', border: '1px solid #f1f5f9',
                          borderRadius: 12, padding: '12px 16px', cursor: 'pointer',
                          borderLeft: `3px solid ${cfg.color}`,
                          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                          transition: 'all 0.15s',
                        }}
                          onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                          onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'none' }}>

                          {/* Hàng 1: loại + tài sản + giờ */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ background: cfg.bg, color: cfg.color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800, border: `1px solid ${cfg.color}30` }}>
                                {cfg.label}
                              </span>
                              {ev.asset_code && (
                                <span onClick={e => { e.stopPropagation(); navigate(`/assets/${ev.asset_id}`) }}
                                  style={{ fontSize: 12, color: '#2563eb', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
                                  {ev.asset_code}
                                </span>
                              )}
                              {ev.asset_name && (
                                <span style={{ fontSize: 12, color: '#64748b' }}>{ev.asset_name}</span>
                              )}
                            </div>
                            <span style={{ fontSize: 11, color: '#94a3b8', background: '#f8fafc', padding: '2px 8px', borderRadius: 6, flexShrink: 0, marginLeft: 8 }}>
                              {fmtTime(ev.created_at)}
                            </span>
                          </div>

                          {/* Mô tả */}
                          {ev.event_description && (
                            <div style={{ fontSize: 12, color: '#475569', marginBottom: 6, lineHeight: 1.55, background: '#fafafa', padding: '6px 10px', borderRadius: 7 }}>
                              {translateDescription(ev.event_description)}
                            </div>
                          )}

                          {/* Metadata: người, vị trí, phiếu */}
                          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#94a3b8', flexWrap: 'wrap' }}>
                            {ev.performed_by_name && (
                              <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                👤 <strong style={{ color: '#475569' }}>{ev.performed_by_name}</strong>
                              </span>
                            )}
                            {ev.from_location_name && (
                              <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                📍 <span>{ev.from_location_name}</span>
                                {ev.to_location_name && <><span style={{ color: '#cbd5e1' }}>→</span><strong style={{ color: '#1d4ed8' }}>{ev.to_location_name}</strong></>}
                              </span>
                            )}
                            {!ev.from_location_name && ev.to_location_name && (
                              <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                📍 <strong style={{ color: '#1d4ed8' }}>{ev.to_location_name}</strong>
                              </span>
                            )}
                            {ev.transfer_order_code && (
                              <span onClick={e => { e.stopPropagation(); navigate(`/transfers/${ev.transfer_order_id}`) }}
                                style={{ color: '#7c3aed', cursor: 'pointer', fontWeight: 700, display: 'flex', gap: 4 }}>
                                📄 {ev.transfer_order_code}
                              </span>
                            )}
                          </div>

                          {/* Thay đổi */}
                          {hasChanges && <DiffBadges prev={ev.previous_state} next={ev.new_state} />}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Phân trang */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 16, padding: '16px 0' }}>
                <Btn variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Trang trước</Btn>
                <div style={{ display: 'flex', gap: 4 }}>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let p
                    if (totalPages <= 5) p = i + 1
                    else if (page <= 3) p = i + 1
                    else if (page >= totalPages - 2) p = totalPages - 4 + i
                    else p = page - 2 + i
                    return (
                      <button key={p} onClick={() => setPage(p)} style={{
                        width: 34, height: 34, borderRadius: 8, border: '1px solid',
                        borderColor: p === page ? '#1a2744' : '#e2e8f0',
                        background: p === page ? '#1a2744' : 'white',
                        color: p === page ? 'white' : '#64748b',
                        fontSize: 13, fontWeight: p === page ? 700 : 400, cursor: 'pointer',
                      }}>{p}</button>
                    )
                  })}
                </div>
                <Btn variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Trang sau →</Btn>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
