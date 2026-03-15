import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { assetApi } from '../services/api'
import { Card, PageHeader, StatusBadge, Btn, DynAttrBadges, fmtVnd, Spinner } from '../components/ui'
import AssetFormModal from './AssetFormModal'

const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001/api/v1'
const IMG_HOST = BASE.replace('/api/v1', '')

const fmtDate = d => {
  if (!d) return '—'
  try { const s = String(d).substring(0, 10); const [y, m, day] = s.split('-'); return `${day}/${m}/${y}` }
  catch { return d }
}

const InfoRow = ({ label, value }) => (
  <div style={{ display: 'flex', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
    <span style={{ width: 190, fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>{label}</span>
    <span style={{ fontSize: 13, fontWeight: 500, wordBreak: 'break-word' }}>{value ?? '—'}</span>
  </div>
)

function Lightbox({ url, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 3000, cursor: 'zoom-out',
    }} onClick={onClose}>
      <img src={url} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 10, cursor: 'default', boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}
        onClick={e => e.stopPropagation()} />
      <button onClick={onClose} style={{
        position: 'absolute', top: 20, right: 20, background: 'white', border: 'none',
        borderRadius: '50%', width: 40, height: 40, fontSize: 18, cursor: 'pointer',
      }}>✕</button>
    </div>
  )
}

export default function AssetDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => assetApi.delete(id),
    onSuccess: () => { qc.invalidateQueries(['assets']); navigate('/assets') },
    onError: (e) => alert('Lỗi xoá: ' + (e.response?.data?.detail || e.message)),
  })

  const { data: asset, isLoading } = useQuery({
    queryKey: ['asset', id],
    queryFn: () => assetApi.getById(id).then(r => r.data),
    enabled: !!id,
  })

  const { data: lifecycle } = useQuery({
    queryKey: ['lifecycle', id],
    queryFn: () => assetApi.getLifecycle(id).then(r => r.data),
    enabled: !!id,
  })

  if (isLoading) return <Spinner />
  if (!asset) return <div style={{ padding: 40 }}>Không tìm thấy tài sản</div>

  const imgUrl = asset.asset_image_url ? `${IMG_HOST}${asset.asset_image_url}` : null
  const qrUrl = `${BASE}/assets/${id}/qr-image`

  const EVENT_ICONS = {
    CREATED: '➕', ALLOCATED: '📤', RECOVERED: '📥',
    TRANSFERRED: '🔄', MAINTENANCE_STARTED: '🔧', MAINTENANCE_COMPLETED: '✅',
    LIQUIDATED: '🗑️', QR_SCANNED: '📱', STATUS_CHANGED: '🔁',
    LOCATION_CHANGED: '📍', ATTRIBUTE_UPDATED: '✏️',
  }

  return (
    <div>
      {showEditModal && (
        <AssetFormModal
          assetId={id}
          onClose={() => setShowEditModal(false)}
          onSaved={() => { qc.invalidateQueries(['asset', id]); qc.invalidateQueries(['assets']) }}
        />
      )}
      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
      {qrOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000,
        }} onClick={() => setQrOpen(false)}>
          <div style={{ background: 'white', borderRadius: 16, padding: 28, textAlign: 'center', minWidth: 280 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>📱 Mã QR — {asset.asset_code}</div>
            <img src={`${qrUrl}?token=${localStorage.getItem('access_token')}`}
              alt="QR" style={{ width: 220, height: 220, border: '1px solid #e2e8f0', borderRadius: 8 }}
              onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='block' }}
            />
            <div style={{ display: 'none', color: '#64748b', fontSize: 13, marginTop: 8 }}>
              Mã QR: {asset.qr_code || asset.asset_code}
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center' }}>
              <a href={qrUrl} download={`QR-${asset.asset_code}.png`} style={{
                padding: '8px 16px', background: '#1a2744', color: 'white',
                borderRadius: 7, fontSize: 13, textDecoration: 'none', fontWeight: 600,
              }}>⬇ Tải xuống</a>
              <button onClick={() => setQrOpen(false)} style={{
                padding: '8px 14px', background: '#f1f5f9', border: 'none',
                borderRadius: 7, fontSize: 13, cursor: 'pointer',
              }}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 28, maxWidth: 380, width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Xoá tài sản?</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
              Tài sản <strong>{asset.asset_code}</strong> sẽ bị ẩn khỏi hệ thống.<br />Thao tác này có thể hoàn tác bởi admin.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setConfirmDelete(false)} style={{ padding: '9px 20px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: 13 }}>Huỷ</button>
              <button onClick={() => { setConfirmDelete(false); deleteMutation.mutate() }} style={{ padding: '9px 20px', borderRadius: 7, border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Xác nhận xoá</button>
            </div>
          </div>
        </div>
      )}

      <PageHeader
        title={`📦 ${asset.asset_code} — ${asset.name}`}
        subtitle={`Cập nhật lần cuối: ${fmtDate(asset.updated_at)}`}
        actions={
          <>
            <Btn variant="outline" size="sm" onClick={() => navigate('/assets')}>← Danh sách</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setQrOpen(true)}>📱 Xem QR</Btn>
            <Btn variant="primary" size="sm" onClick={() => setShowEditModal(true)}>✏️ Chỉnh sửa</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}
              style={{ color: '#ef4444', border: '1px solid #fca5a5' }}>🗑️ Xoá</Btn>
          </>
        }
      />

      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Image + status bar */}
          <Card style={{ padding: 16 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              {/* Asset image */}
              <div style={{ flexShrink: 0 }}>
                {imgUrl ? (
                  <img src={imgUrl} alt={asset.name}
                    style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 10, border: '1px solid #e2e8f0', cursor: 'zoom-in' }}
                    onClick={() => setLightboxUrl(imgUrl)}
                    onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }}
                  />
                ) : null}
                <div style={{
                  width: 120, height: 120, borderRadius: 10, background: '#f1f5f9',
                  display: imgUrl ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 40, color: '#cbd5e1',
                }}>📷</div>
                {imgUrl && (
                  <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', marginTop: 4, cursor: 'pointer' }}
                    onClick={() => setLightboxUrl(imgUrl)}>
                    Click để phóng to
                  </div>
                )}
              </div>
              {/* Status info */}
              <div style={{ flex: 1 }}>
                <div style={{ marginBottom: 10 }}><StatusBadge status={asset.status} /></div>
                <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 2 }}>
                  <div>📍 <strong>Vị trí:</strong> {asset.location_name || '—'}</div>
                  <div>🏢 <strong>Phòng ban:</strong> {asset.department_name || '—'}</div>
                  <div>🏷️ <strong>Loại TS:</strong> {asset.asset_type_name || '—'}</div>
                  {asset.current_personnel_name && <div>👤 <strong>NSD:</strong> {asset.current_personnel_name}</div>}
                </div>
              </div>
            </div>
          </Card>

          {/* Basic info */}
          <Card>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Thông tin cơ bản</h3>
            <InfoRow label="Mã tài sản" value={asset.asset_code} />
            <InfoRow label="Barcode" value={asset.barcode} />
            <InfoRow label="Tên tài sản" value={asset.name} />
            <InfoRow label="Loại tài sản" value={asset.asset_type_name} />
            <InfoRow label="Phòng ban quản lý" value={asset.department_name} />
            <InfoRow label="Nhà cung cấp" value={asset.supplier_name} />
            <InfoRow label="Model / Series" value={asset.model_series} />
            <InfoRow label="Năm SX / Nước SX" value={
              asset.year_manufactured || asset.country_manufactured
                ? [asset.year_manufactured, asset.country_manufactured].filter(Boolean).join(' - ')
                : null
            } />
            <InfoRow label="Mô tả" value={asset.description} />
            <InfoRow label="Tình trạng" value={asset.condition_description} />
          </Card>

          {/* Financial */}
          <Card>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Thông tin tài chính</h3>
            <InfoRow label="Giá mua" value={fmtVnd(asset.purchase_price)} />
            <InfoRow label="Nguyên giá" value={fmtVnd(asset.original_value)} />
            <InfoRow label="Giá trị hiện tại" value={fmtVnd(asset.current_value)} />
            <InfoRow label="Giá trị khấu hao" value={fmtVnd(asset.depreciation_value)} />
            <InfoRow label="Khấu hao (tháng)" value={asset.depreciation_months ? `${asset.depreciation_months} tháng` : null} />
            <InfoRow label="Đã vay" value={fmtVnd(asset.loan_amount)} />
            <InfoRow label="Ngày mua" value={fmtDate(asset.purchase_date)} />
            <InfoRow label="Ngày báo tăng" value={fmtDate(asset.report_increase_date)} />
            <InfoRow label="Hết hạn BH" value={fmtDate(asset.warranty_end_date)} />
            <InfoRow label="Thời gian BH (tháng)" value={asset.warranty_months ? `${asset.warranty_months} tháng` : null} />
            <InfoRow label="Ngày hết hạn" value={fmtDate(asset.expiry_date)} />
          </Card>

          {/* Vehicle specific */}
          {(asset.chassis_number || asset.engine_number || asset.registration_expiry) && (
            <Card>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>🚗 Thông tin xe / máy</h3>
              <InfoRow label="Số khung" value={asset.chassis_number} />
              <InfoRow label="Số động cơ" value={asset.engine_number} />
              <InfoRow label="Hạn đăng kiểm" value={fmtDate(asset.registration_expiry)} />
            </Card>
          )}

          {/* Dynamic attributes */}
          {asset.dynamic_attributes && Object.keys(asset.dynamic_attributes).length > 0 && (
            <Card>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>⚙️ Thông số đặc thù</h3>
              <DynAttrBadges attrs={asset.dynamic_attributes} />
              <div style={{ marginTop: 12 }}>
                {Object.entries(asset.dynamic_attributes).map(([k, v]) => (
                  <InfoRow key={k} label={k.replace(/_/g, ' ')} value={String(v)} />
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* QR Code */}
          <Card style={{ textAlign: 'center', padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>📱 Mã QR tài sản</div>
            <div style={{
              width: 140, height: 140, margin: '0 auto 10px', background: '#f8fafc',
              borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden', cursor: 'pointer',
            }} onClick={() => setQrOpen(true)}>
              <img src={`${BASE}/assets/${id}/qr-image`} alt="QR"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                onError={e => { e.target.style.display = 'none' }}
              />
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
              {asset.qr_code || asset.asset_code}
            </div>
            <Btn variant="outline" size="sm" onClick={() => setQrOpen(true)}>
              🔍 Xem lớn & In
            </Btn>
          </Card>

          {/* Quantities */}
          <Card>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Số lượng</h3>
            {[
              ['Tổng SL', asset.quantity, '#1a2744'],
              ['Đang sử dụng', asset.qty_allocated, '#10b981'],
              ['Đã thu hồi', asset.qty_recovered, '#3b82f6'],
              ['Đang bảo trì', asset.qty_maintenance, '#f59e0b'],
              ['Thanh lý', asset.qty_liquidated, '#ef4444'],
              ['Mất', asset.qty_lost, '#6b7280'],
            ].map(([label, val, color]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>{label}</span>
                <span style={{ fontWeight: 800, color }}>{val ?? 0}</span>
              </div>
            ))}
          </Card>

          {/* Lifecycle timeline */}
          <Card style={{ flex: 1 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700 }}>📜 Lịch sử vòng đời</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {(lifecycle || []).slice(0, 15).map((ev, i) => (
                <div key={ev.id} style={{ display: 'flex', gap: 10, paddingBottom: 12, position: 'relative' }}>
                  {i < (lifecycle?.length ?? 0) - 1 && (
                    <div style={{ position: 'absolute', left: 15, top: 30, bottom: 0, width: 2, background: 'var(--border)' }} />
                  )}
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%', background: 'var(--bg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, flexShrink: 0, zIndex: 1, border: '2px solid var(--border)'
                  }}>
                    {EVENT_ICONS[ev.event_type] || '•'}
                  </div>
                  <div style={{ flex: 1, paddingTop: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{ev.event_description || ev.event_type}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {ev.created_at ? new Date(ev.created_at).toLocaleString('vi-VN') : ''}
                    </div>
                  </div>
                </div>
              ))}
              {!lifecycle?.length && (
                <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>
                  Chưa có sự kiện nào
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
