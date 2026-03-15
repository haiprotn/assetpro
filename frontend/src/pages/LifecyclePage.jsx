import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { lifecycleApi, assetApi } from '../services/api'
import { Card, PageHeader, Spinner, Btn } from '../components/ui'

// ── Cấu hình sự kiện (toàn tiếng Việt) ─────────────────────────────────────
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

// Dịch tên trường DB → tiếng Việt
const FIELD_VI = {
  status:              'Trạng thái',
  location_id:         'Vị trí',
  department_id:       'Phòng ban',
  personnel_id:        'Nhân sự phụ trách',
  asset_type_id:       'Loại tài sản',
  purchase_date:       'Ngày mua',
  purchase_price:      'Giá mua',
  warranty_expiry:     'Hạn bảo hành',
  name:                'Tên tài sản',
  asset_code:          'Mã tài sản',
  serial_number:       'Số serial',
  barcode:             'Mã vạch',
  notes:               'Ghi chú',
  condition:           'Tình trạng',
  quantity:            'Số lượng',
  from_location_id:    'Vị trí đi',
  to_location_id:      'Vị trí đến',
  from_department_id:  'Phòng ban đi',
  to_department_id:    'Phòng ban đến',
  supplier_id:         'Nhà cung cấp',
  managing_department_id: 'Phòng ban quản lý',
}

// Dịch giá trị trạng thái → tiếng Việt
const STATUS_VI = {
  AVAILABLE:            'Sẵn sàng',
  IN_USE:               'Đang sử dụng',
  UNDER_MAINTENANCE:    'Đang bảo trì',
  RETIRED:              'Đã thanh lý',
  LOST:                 'Mất / Thất lạc',
  DAMAGED:              'Hỏng hóc',
  STORED:               'Đang lưu kho',
  PENDING:              'Chờ xử lý',
  APPROVED:             'Đã duyệt',
  IN_TRANSIT:           'Đang vận chuyển',
  COMPLETED:            'Hoàn thành',
  CANCELLED:            'Đã huỷ',
  REJECTED:             'Từ chối',
  DRAFT:                'Nháp',
  ALLOCATED:            'Đã cấp phát',
}

const fieldLabel  = k => FIELD_VI[k]  || k
const statusLabel = v => (typeof v === 'string' && STATUS_VI[v]) ? STATUS_VI[v] : v

// ── Hiển thị thay đổi trước → sau ───────────────────────────────────────────
function DiffBadges({ prev, next }) {
  if (!prev && !next) return null
  const keys = Array.from(new Set([...Object.keys(prev || {}), ...Object.keys(next || {})]))
  const changed = keys.filter(k => prev?.[k] !== next?.[k])
  if (!changed.length) return null
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
      {changed.map(k => (
        <span key={k} style={{ fontSize: 11, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '2px 8px', color: '#475569', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          <span style={{ color: '#94a3b8' }}>{fieldLabel(k)}:</span>
          {prev?.[k] !== undefined && (
            <span style={{ color: '#ef4444', textDecoration: 'line-through' }}>{statusLabel(String(prev[k]))}</span>
          )}
          <span style={{ color: '#64748b' }}>→</span>
          {next?.[k] !== undefined && (
            <span style={{ color: '#10b981', fontWeight: 700 }}>{statusLabel(String(next[k]))}</span>
          )}
        </span>
      ))}
    </div>
  )
}

// ── Modal chi tiết sự kiện ────────────────────────────────────────────────────
function EventModal({ ev, onClose }) {
  const cfg = EVENT_CFG[ev.event_type] || { icon: '•', color: '#64748b', bg: '#f8fafc', label: ev.event_type }

  const Row = ({ label, value }) => !value ? null : (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f8fafc', fontSize: 13, gap: 16 }}>
      <span style={{ color: '#64748b', flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 600, color: '#1a2744', textAlign: 'right' }}>{value}</span>
    </div>
  )

  const hasChange = ev.previous_state || ev.new_state || (ev.changed_fields && Object.keys(ev.changed_fields || {}).length)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'white', borderRadius: 16, width: 520, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 11, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
              {cfg.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#1a2744' }}>{cfg.label}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                {new Date(ev.created_at).toLocaleString('vi-VN', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8', padding: 4 }}>×</button>
          </div>
        </div>

        <div style={{ padding: '14px 22px 22px' }}>
          {/* Thông tin cơ bản */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Thông tin</div>
            <Row label="Tài sản"          value={ev.asset_code ? `${ev.asset_code}  —  ${ev.asset_name || ''}` : null} />
            <Row label="Người thực hiện"  value={ev.performed_by_name} />
            <Row label="Từ vị trí"        value={ev.from_location_name} />
            <Row label="Đến vị trí"       value={ev.to_location_name} />
            <Row label="Phiếu điều chuyển" value={ev.transfer_order_code} />
            <Row label="Tọa độ GPS"       value={ev.gps_coordinates ? `${ev.gps_coordinates.lat?.toFixed(5)}, ${ev.gps_coordinates.lng?.toFixed(5)}` : null} />
          </div>

          {/* Mô tả */}
          {ev.event_description && (
            <div style={{ marginBottom: 14, background: '#f8fafc', borderRadius: 8, padding: '10px 13px', fontSize: 13, color: '#475569', lineHeight: 1.65 }}>
              {ev.event_description}
            </div>
          )}

          {/* Thay đổi */}
          {hasChange && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Nội dung thay đổi</div>
              <DiffBadges prev={ev.previous_state} next={ev.new_state} />
              {ev.changed_fields && Object.keys(ev.changed_fields).length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {Object.entries(ev.changed_fields).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12, padding: '5px 8px', background: '#f8fafc', borderRadius: 6 }}>
                      <span style={{ color: '#94a3b8', minWidth: 140 }}>{fieldLabel(k)}</span>
                      <span style={{ color: '#1a2744', fontWeight: 600, wordBreak: 'break-all' }}>{statusLabel(String(v))}</span>
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

// ── Lọc tài sản ──────────────────────────────────────────────────────────────
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
        <div style={{ display: 'flex', gap: 5 }}>
          <div style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #10b981', background: '#f0fdf4', fontSize: 13, fontWeight: 600 }}>
            {value.asset_code}
          </div>
          <button onClick={() => onChange(null)} style={{ padding: '0 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 12, color: '#64748b' }}>✕</button>
        </div>
      ) : (
        <>
          <input value={q} onChange={e => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
            placeholder="Lọc theo tài sản..." style={{ padding: '7px 11px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13, width: 190, outline: 'none' }} />
          {open && (data || []).length > 0 && (
            <div style={{ position: 'absolute', top: '110%', left: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 9, boxShadow: '0 6px 20px rgba(0,0,0,0.1)', zIndex: 200, minWidth: 260 }}>
              {(data || []).map(a => (
                <div key={a.id} onClick={() => { onChange(a); setOpen(false); setQ('') }}
                  style={{ padding: '9px 13px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f8fafc' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                  <strong>{a.asset_code}</strong>
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
    event_type: filterType       || undefined,
    asset_id:   filterAsset?.id  || undefined,
    date_from:  dateFrom         || undefined,
    date_to:    dateTo           || undefined,
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

  // Thống kê theo loại sự kiện
  const typeCounts = useMemo(() => {
    const map = {}
    for (const ev of events) map[ev.event_type] = (map[ev.event_type] || 0) + 1
    return map
  }, [events])

  // Nhóm sự kiện theo ngày
  const grouped = useMemo(() => {
    const acc = {}
    for (const ev of events) {
      const d = ev.created_at
        ? new Date(ev.created_at).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
        : 'Không rõ ngày'
      if (!acc[d]) acc[d] = []
      acc[d].push(ev)
    }
    return acc
  }, [events])

  const hasFilter = filterType || filterAsset || dateFrom || dateTo
  const clearFilter = () => { setFilterType(''); setFilterAsset(null); setDateFrom(''); setDateTo(''); resetPage() }

  return (
    <div>
      {viewing && <EventModal ev={viewing} onClose={() => setViewing(null)} />}

      <PageHeader
        title="Lịch sử vòng đời tài sản"
        subtitle={`${total.toLocaleString('vi-VN')} sự kiện đã ghi nhận${isFetching && !isLoading ? '  •  Đang tải...' : ''}`}
      />

      <div style={{ padding: 24 }}>

        {/* Bộ lọc */}
        <Card style={{ marginBottom: 16, padding: '14px 18px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Loại sự kiện</div>
              <select value={filterType} onChange={e => { setFilterType(e.target.value); resetPage() }}
                style={{ padding: '7px 11px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13, background: 'white', minWidth: 200 }}>
                <option value="">Tất cả loại</option>
                {Object.entries(EVENT_CFG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Tài sản</div>
              <AssetFilter value={filterAsset} onChange={a => { setFilterAsset(a); resetPage() }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Từ ngày</div>
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); resetPage() }}
                style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13 }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Đến ngày</div>
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); resetPage() }}
                style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13 }} />
            </div>
            {hasFilter && (
              <button onClick={clearFilter}
                style={{ padding: '7px 13px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 12, cursor: 'pointer', color: '#64748b', alignSelf: 'flex-end' }}>
                Xoá bộ lọc
              </button>
            )}
          </div>

          {/* Chip thống kê loại sự kiện trong trang hiện tại */}
          {events.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(typeCounts).map(([type, count]) => {
                const cfg = EVENT_CFG[type] || { bg: '#f1f5f9', color: '#64748b', label: type }
                return (
                  <button key={type} onClick={() => { setFilterType(filterType === type ? '' : type); resetPage() }}
                    style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      background: filterType === type ? cfg.color : cfg.bg,
                      color:      filterType === type ? 'white'   : cfg.color,
                      border: `1px solid ${cfg.color}40`,
                    }}>
                    {cfg.label} ({count})
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        {/* Danh sách timeline */}
        {isLoading ? <Spinner /> : events.length === 0 ? (
          <Card style={{ padding: 60, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            Không có sự kiện nào phù hợp
          </Card>
        ) : (
          <>
            {Object.entries(grouped).map(([day, dayEvents]) => (
              <div key={day} style={{ marginBottom: 20 }}>
                {/* Nhãn ngày */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', background: '#f1f5f9', padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                    {day}
                  </span>
                  <div style={{ flex: 1, height: 1, background: '#f1f5f9' }} />
                  <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{dayEvents.length} sự kiện</span>
                </div>

                {/* Card timeline ngày */}
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  {dayEvents.map((ev, i) => {
                    const cfg    = EVENT_CFG[ev.event_type] || { icon: '•', color: '#64748b', bg: '#f8fafc', label: ev.event_type }
                    const isLast = i === dayEvents.length - 1
                    const hasChanges = ev.previous_state || ev.new_state

                    return (
                      <div key={ev.id}
                        onClick={() => setViewing(ev)}
                        style={{
                          display: 'flex', gap: 0, cursor: 'pointer',
                          borderBottom: isLast ? 'none' : '1px solid #f8fafc',
                          borderLeft: `3px solid ${cfg.color}`,
                          transition: 'background 0.12s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'}
                        onMouseLeave={e => e.currentTarget.style.background = 'white'}>

                        {/* Icon + đường dọc */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 0 14px 16px', width: 50, flexShrink: 0 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
                            {cfg.icon}
                          </div>
                          {!isLast && <div style={{ width: 2, flex: 1, background: '#f1f5f9', marginTop: 4 }} />}
                        </div>

                        {/* Nội dung */}
                        <div style={{ flex: 1, padding: '13px 14px 13px 10px', minWidth: 0 }}>
                          {/* Hàng đầu: loại + tài sản + giờ */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 3 }}>
                            <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ background: cfg.bg, color: cfg.color, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                                {cfg.label}
                              </span>
                              {ev.asset_code && (
                                <span onClick={e => { e.stopPropagation(); navigate(`/assets/${ev.asset_id}`) }}
                                  style={{ fontSize: 12, color: '#2563eb', fontWeight: 700, cursor: 'pointer' }}>
                                  {ev.asset_code}
                                </span>
                              )}
                              {ev.asset_name && (
                                <span style={{ fontSize: 12, color: '#475569' }}>{ev.asset_name}</span>
                              )}
                            </div>
                            <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
                              {new Date(ev.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          {/* Mô tả */}
                          {ev.event_description && (
                            <div style={{ fontSize: 12, color: '#475569', marginBottom: 4, lineHeight: 1.5 }}>
                              {ev.event_description}
                            </div>
                          )}

                          {/* Metadata */}
                          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#94a3b8', flexWrap: 'wrap' }}>
                            {ev.performed_by_name && (
                              <span>Người thực hiện: <strong style={{ color: '#475569' }}>{ev.performed_by_name}</strong></span>
                            )}
                            {ev.from_location_name && (
                              <span>Từ: <strong style={{ color: '#475569' }}>{ev.from_location_name}</strong></span>
                            )}
                            {ev.to_location_name && (
                              <span>Đến: <strong style={{ color: '#1d4ed8' }}>{ev.to_location_name}</strong></span>
                            )}
                            {ev.transfer_order_code && (
                              <span onClick={e => { e.stopPropagation(); navigate(`/transfers/${ev.transfer_order_id}`) }}
                                style={{ color: '#7c3aed', cursor: 'pointer', fontWeight: 600 }}>
                                Phiếu: {ev.transfer_order_code}
                              </span>
                            )}
                            {ev.gps_coordinates && (
                              <span>Tọa độ: {ev.gps_coordinates.lat?.toFixed(4)}, {ev.gps_coordinates.lng?.toFixed(4)}</span>
                            )}
                          </div>

                          {/* Thay đổi trước/sau */}
                          {hasChanges && <DiffBadges prev={ev.previous_state} next={ev.new_state} />}
                        </div>

                        {/* Mũi tên xem chi tiết */}
                        <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', flexShrink: 0, color: '#cbd5e1', fontSize: 14 }}>›</div>
                      </div>
                    )
                  })}
                </Card>
              </div>
            ))}

            {/* Phân trang */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <Btn variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Trang trước</Btn>
                <span style={{ fontSize: 13, color: 'var(--muted)', padding: '0 8px' }}>Trang {page} / {totalPages}</span>
                <Btn variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Trang sau →</Btn>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
