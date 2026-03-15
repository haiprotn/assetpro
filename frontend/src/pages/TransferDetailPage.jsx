import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { transferApi } from '../services/api'
import { Card, PageHeader, Btn, StatusBadge, Spinner, fmtDate } from '../components/ui'
import toast from 'react-hot-toast'

const FLOW_STEPS = [
  { key: 'DRAFT',      label: 'Nháp',        icon: '📝' },
  { key: 'APPROVED',   label: 'Đã duyệt',    icon: '✅' },
  { key: 'IN_TRANSIT', label: 'Vận chuyển',  icon: '🚛' },
  { key: 'COMPLETED',  label: 'Hoàn thành',  icon: '🏁' },
]

const ORDER_TYPE_VI = {
  ALLOCATION:      'Cấp phát tài sản',
  RECOVERY:        'Thu hồi tài sản',
  TRANSFER:        'Điều chuyển',
  MAINTENANCE_OUT: 'Gửi bảo trì',
  LIQUIDATION:     'Thanh lý / Xử lý',
}

// ── Small helpers ────────────────────────────────────────────────────────────

function InfoRow({ label, value, highlight, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, gap: 8, fontSize: 13 }}>
      <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{label}:</span>
      <span style={{ fontWeight: bold ? 800 : 600, color: highlight ? '#2563eb' : '#1a2744', textAlign: 'right' }}>
        {value || '—'}
      </span>
    </div>
  )
}

function ConfirmModal({ title, message, requireInput, placeholder, onConfirm, onClose, loading }) {
  const [reason, setReason] = useState('')
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'white', borderRadius: 14, padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>{title}</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{message}</p>
        {requireInput && (
          <textarea value={reason} onChange={e => setReason(e.target.value)}
            placeholder={placeholder || 'Nhập lý do...'}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13, height: 80, resize: 'vertical', boxSizing: 'border-box', marginBottom: 14 }}
          />
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn variant="outline" onClick={onClose}>Đóng</Btn>
          <Btn variant="danger" onClick={() => onConfirm(reason)} disabled={loading || (requireInput && !reason.trim())}>
            {loading ? '⏳...' : 'Xác nhận'}
          </Btn>
        </div>
      </div>
    </div>
  )
}

function QRModal({ order, onClose, qc }) {
  const { mutate: verify, isPending } = useMutation({
    mutationFn: () => transferApi.verifyQr(order.id, {
      qr_verification_token: order.qr_verification_token,
      confirmed_by_user_id: '00000000-0000-0000-0000-000000000001',
    }),
    onSuccess: () => {
      toast.success('✅ Xác nhận nhận hàng thành công!')
      qc.invalidateQueries(['transfer', order.id])
      qc.invalidateQueries(['transfers'])
      onClose()
    },
    onError: (e) => toast.error('Lỗi: ' + (e.response?.data?.detail || e.message)),
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'white', borderRadius: 16, padding: 32, width: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>📱 Xác nhận nhận hàng</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
        </div>
        <div style={{ background: '#f0fdf4', borderRadius: 10, padding: 20, marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Phiếu: <strong>{order.order_code}</strong></div>
          <div style={{ fontSize: 42, marginBottom: 8 }}>📦</div>
          <div style={{ fontSize: 14, color: '#15803d', fontWeight: 700, marginBottom: 4 }}>
            {order.from_location_name || '—'} → {order.to_location_name || '—'}
          </div>
          <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#6b7280', background: 'white', borderRadius: 6, padding: '6px 10px', marginTop: 8, wordBreak: 'break-all' }}>
            Token: {order.qr_verification_token}
          </div>
        </div>
        <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, marginBottom: 20 }}>
          Nhấn xác nhận khi đã kiểm tra đủ tài sản. Thao tác này sẽ hoàn tất phiếu điều chuyển và cập nhật vị trí tài sản.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <Btn variant="outline" onClick={onClose} style={{ flex: 1 }}>Đóng</Btn>
          <Btn variant="primary" onClick={() => verify()} disabled={isPending} style={{ flex: 1 }}>
            {isPending ? '⏳ Đang xác nhận...' : '✅ Xác nhận đã nhận đủ hàng'}
          </Btn>
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function TransferDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [dialog, setDialog] = useState(null) // 'reject' | 'cancel' | null
  const [showQR, setShowQR] = useState(false)

  const { data: order, isLoading } = useQuery({
    queryKey: ['transfer', id],
    queryFn: () => transferApi.getById(id).then(r => r.data),
  })

  const { data: items = [] } = useQuery({
    queryKey: ['transfer-items', id],
    queryFn: () => transferApi.getItems(id).then(r => r.data),
    enabled: !!id,
  })

  const invalidate = () => {
    qc.invalidateQueries(['transfer', id])
    qc.invalidateQueries(['transfers'])
  }

  const approveMutation = useMutation({
    mutationFn: () => transferApi.approve(id),
    onSuccess: () => { toast.success('Đã phê duyệt phiếu!'); invalidate() },
    onError: (e) => toast.error(e.response?.data?.detail || e.message),
  })
  const dispatchMutation = useMutation({
    mutationFn: () => transferApi.dispatch(id),
    onSuccess: () => { toast.success('Đã xuất tài sản! Đang vận chuyển.'); invalidate() },
    onError: (e) => toast.error(e.response?.data?.detail || e.message),
  })
  const rejectMutation = useMutation({
    mutationFn: (reason) => transferApi.reject(id, reason),
    onSuccess: () => { toast.success('Đã từ chối phiếu.'); invalidate(); setDialog(null) },
    onError: (e) => toast.error(e.response?.data?.detail || e.message),
  })
  const cancelMutation = useMutation({
    mutationFn: (reason) => transferApi.cancel(id, reason),
    onSuccess: () => { toast.success('Đã huỷ phiếu.'); invalidate(); setDialog(null) },
    onError: (e) => toast.error(e.response?.data?.detail || e.message),
  })

  if (isLoading) return <Spinner />
  if (!order) return <div style={{ padding: 24, color: 'var(--muted)' }}>Không tìm thấy phiếu điều chuyển.</div>

  const status = order.status
  const isTerminal = ['COMPLETED', 'REJECTED', 'CANCELLED'].includes(status)
  const stepIndex = FLOW_STEPS.findIndex(s => s.key === status)

  return (
    <div>
      <PageHeader
        title={`🔄 ${order.order_code}`}
        subtitle={`${ORDER_TYPE_VI[order.order_type] || order.order_type}  •  Tạo ngày ${fmtDate(order.created_at)}`}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusBadge status={status} />
            <Btn variant="outline" onClick={() => navigate('/transfers')}>← Danh sách</Btn>
            {(status === 'DRAFT' || status === 'PENDING_APPROVAL') && (
              <>
                <Btn variant="primary" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>✅ Phê duyệt</Btn>
                <Btn variant="danger" onClick={() => setDialog('reject')}>✗ Từ chối</Btn>
              </>
            )}
            {status === 'APPROVED' && (
              <Btn variant="accent" onClick={() => dispatchMutation.mutate()} disabled={dispatchMutation.isPending}>
                🚛 Xuất kho / Vận chuyển
              </Btn>
            )}
            {(status === 'IN_TRANSIT' || status === 'PENDING_QR_CONFIRM') && (
              <Btn variant="primary" style={{ background: '#d97706' }} onClick={() => setShowQR(true)}>
                📱 Xác nhận nhận hàng
              </Btn>
            )}
            {!isTerminal && (
              <Btn variant="outline" style={{ color: '#dc2626', borderColor: '#fecaca' }} onClick={() => setDialog('cancel')}>
                Huỷ phiếu
              </Btn>
            )}
          </div>
        }
      />

      <div style={{ padding: 24, maxWidth: 1000 }}>

        {/* Progress bar (only for normal flow, not terminal cancelled/rejected) */}
        {!['REJECTED', 'CANCELLED'].includes(status) && (
          <Card style={{ marginBottom: 16, padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              {FLOW_STEPS.map((step, i) => {
                const done   = i < stepIndex
                const active = i === stepIndex
                return (
                  <div key={step.key} style={{ display: 'flex', alignItems: 'flex-start', flex: 1 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 72 }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: done ? 16 : 18,
                        background: done ? '#10b981' : active ? '#2563eb' : '#e2e8f0',
                        color: (done || active) ? 'white' : '#94a3b8',
                        fontWeight: 700, boxShadow: active ? '0 0 0 4px #dbeafe' : 'none',
                      }}>
                        {done ? '✓' : step.icon}
                      </div>
                      <div style={{
                        fontSize: 10, marginTop: 5, textAlign: 'center', lineHeight: 1.3,
                        fontWeight: active ? 700 : 400,
                        color: active ? '#2563eb' : done ? '#10b981' : '#94a3b8',
                      }}>
                        {step.label}
                      </div>
                    </div>
                    {i < FLOW_STEPS.length - 1 && (
                      <div style={{ flex: 1, height: 3, marginTop: 18, background: done ? '#10b981' : '#e2e8f0', transition: 'background 0.3s' }} />
                    )}
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* Rejected / Cancelled banner */}
        {status === 'REJECTED' && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '14px 18px', marginBottom: 16, fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
            ✗ Phiếu đã bị từ chối{order.reason ? ` — Lý do: ${order.reason}` : ''}
          </div>
        )}
        {status === 'CANCELLED' && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 18px', marginBottom: 16, fontSize: 13, color: '#64748b', fontWeight: 600 }}>
            Phiếu đã bị huỷ{order.reason ? ` — Lý do: ${order.reason}` : ''}
          </div>
        )}

        {/* Info cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <Card>
            <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#1a2744' }}>🗺️ Hành trình</h4>
            <InfoRow label="Từ địa điểm" value={order.from_location_name} />
            <InfoRow label="Đến địa điểm" value={order.to_location_name} highlight />
            <InfoRow label="Người phụ trách" value={order.assigned_personnel_name} />
            <InfoRow label="Ngày dự kiến" value={fmtDate(order.planned_date)} />
            {order.completed_at && <InfoRow label="Hoàn thành lúc" value={fmtDate(order.completed_at)} />}
          </Card>
          <Card>
            <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#1a2744' }}>📋 Thông tin phiếu</h4>
            <InfoRow label="Mã phiếu" value={order.order_code} bold />
            <InfoRow label="Loại phiếu" value={ORDER_TYPE_VI[order.order_type] || order.order_type} />
            <InfoRow label="Trạng thái" value={<StatusBadge status={status} />} />
            <InfoRow label="Ngày tạo" value={fmtDate(order.created_at)} />
            {order.reason && <InfoRow label="Lý do" value={order.reason} />}
          </Card>
        </div>

        {/* QR confirm banner */}
        {order.qr_verification_token && !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(status) && (
          <Card style={{ marginBottom: 16, background: '#fffbeb', border: '1px solid #fde68a' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ fontSize: 40 }}>📱</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#92400e' }}>Mã xác nhận QR đang chờ</div>
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#78350f', marginTop: 3, wordBreak: 'break-all' }}>
                  {order.qr_verification_token}
                </div>
                <div style={{ fontSize: 11, color: '#a16207', marginTop: 4 }}>
                  Bên nhận quét / nhập mã này để xác nhận đã nhận đủ tài sản
                </div>
              </div>
              <Btn variant="primary" style={{ background: '#d97706', flexShrink: 0 }} onClick={() => setShowQR(true)}>
                📱 Xác nhận nhận
              </Btn>
            </div>
          </Card>
        )}

        {/* Items table */}
        <Card>
          <h4 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: '#1a2744', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
            📦 Danh sách tài sản ({items.length})
          </h4>
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--muted)', fontSize: 13 }}>Không có tài sản trong phiếu này</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Mã TS', 'Tên tài sản', 'SL', 'Tình trạng trước', 'Tình trạng sau', 'QR Scan'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 800, color: '#1a2744' }}>{item.asset_code || '—'}</td>
                    <td style={{ padding: '9px 12px' }}>{item.asset_name || item.name || '—'}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 600 }}>{item.quantity}</td>
                    <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--muted)' }}>{item.condition_before || '—'}</td>
                    <td style={{ padding: '9px 12px', fontSize: 12, color: 'var(--muted)' }}>{item.condition_after || '—'}</td>
                    <td style={{ padding: '9px 12px' }}>
                      {item.qr_scanned
                        ? <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>✓ Đã quét</span>
                        : <span style={{ background: '#f1f5f9', color: '#94a3b8', borderRadius: 20, padding: '2px 10px', fontSize: 11 }}>Chưa quét</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {/* Dialogs */}
      {dialog === 'reject' && (
        <ConfirmModal
          title="✗ Từ chối phiếu điều chuyển"
          message="Vui lòng nhập lý do từ chối. Người tạo phiếu sẽ được thông báo."
          requireInput placeholder="Lý do từ chối..."
          loading={rejectMutation.isPending}
          onConfirm={(reason) => rejectMutation.mutate(reason)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'cancel' && (
        <ConfirmModal
          title="Huỷ phiếu điều chuyển"
          message="Bạn có chắc muốn huỷ phiếu này? Tài sản sẽ không bị ảnh hưởng."
          requireInput placeholder="Lý do huỷ..."
          loading={cancelMutation.isPending}
          onConfirm={(reason) => cancelMutation.mutate(reason)}
          onClose={() => setDialog(null)}
        />
      )}
      {showQR && <QRModal order={order} onClose={() => setShowQR(false)} qc={qc} />}
    </div>
  )
}
