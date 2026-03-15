import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { transferApi } from '../services/api'
import { Card, PageHeader, StatusBadge, Btn, fmtDate, Spinner } from '../components/ui'
import toast from 'react-hot-toast'

const QRConfirmModal = ({ order, onClose }) => {
  const qc = useQueryClient()
  const { mutate: verify, isLoading } = useMutation({
    mutationFn: (token) => transferApi.verifyQr(order.id, {
      qr_verification_token: token,
      confirmed_by_user_id: 'current-user-id', // from auth store in real impl
    }),
    onSuccess: () => {
      toast.success('✅ Xác nhận QR thành công!')
      qc.invalidateQueries(['transfers'])
      onClose()
    },
    onError: () => toast.error('QR không hợp lệ'),
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{ background: 'white', borderRadius: 16, padding: 32, width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>📱 Xác nhận QR Code</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)' }}>×</button>
        </div>

        <div style={{ background: 'var(--bg)', borderRadius: 12, padding: 20, textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Phiếu: {order.order_code}</div>
          {/* QR visual */}
          <div style={{
            width: 140, height: 140, margin: '0 auto 12px', background: 'white',
            border: '2px solid var(--border)', borderRadius: 10,
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', placeItems: 'center'
          }}>
            {Array(9).fill(0).map((_, i) => (
              <div key={i} style={{ width: 36, height: 36, background: [0,2,6,8].includes(i) ? '#1a2744' : i===4 ? '#f59e0b' : 'transparent', borderRadius: 4 }} />
            ))}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {order.qr_verification_token || 'TRANSFER-TOKEN-XXXXX'}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8, marginBottom: 20, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted)' }}>Từ:</span>
            <span style={{ fontWeight: 600 }}>{order.from_location_name || '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted)' }}>Đến:</span>
            <span style={{ fontWeight: 600, color: '#2563eb' }}>{order.to_location_name || '—'}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Btn variant="outline" onClick={onClose} style={{ flex: 1 }}>Đóng</Btn>
          <Btn variant="primary" onClick={() => verify(order.qr_verification_token)} style={{ flex: 1 }}
            disabled={isLoading}>
            {isLoading ? 'Đang xác nhận...' : '✅ Xác nhận nhận hàng'}
          </Btn>
        </div>
      </div>
    </div>
  )
}

export default function TransfersPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [qrModal, setQrModal] = useState(null)
  const [filterStatus, setFilterStatus] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['transfers', filterStatus],
    queryFn: () => transferApi.list({ status: filterStatus, page: 1, size: 30 }).then(r => r.data),
  })

  const { mutate: approve } = useMutation({
    mutationFn: (id) => transferApi.approve(id),
    onSuccess: () => { toast.success('Đã phê duyệt phiếu'); qc.invalidateQueries(['transfers']) },
  })
  const { mutate: dispatch } = useMutation({
    mutationFn: (id) => transferApi.dispatch(id),
    onSuccess: () => { toast.success('Đã xuất tài sản'); qc.invalidateQueries(['transfers']) },
  })

  const orders = Array.isArray(data) ? data : []

  const counts = {
    draft:    orders.filter(o => ['DRAFT', 'PENDING_APPROVAL'].includes(o.status)).length,
    approved: orders.filter(o => o.status === 'APPROVED').length,
    transit:  orders.filter(o => o.status === 'IN_TRANSIT').length,
    done:     orders.filter(o => o.status === 'COMPLETED').length,
  }

  return (
    <div>
      <PageHeader
        title="🔄 Quản lý điều chuyển tài sản"
        actions={<Btn variant="primary" onClick={() => navigate('/transfers/new')}>+ Tạo phiếu mới</Btn>}
      />
      <div style={{ padding: 24 }}>
        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Nháp',           count: counts.draft,    icon: '📝', color: '#64748b' },
            { label: 'Đã duyệt',       count: counts.approved, icon: '✅', color: '#f59e0b' },
            { label: 'Đang vận chuyển',count: counts.transit,  icon: '🚛', color: '#3b82f6' },
            { label: 'Hoàn thành',     count: counts.done,     icon: '🏁', color: '#10b981' },
          ].map(s => (
            <Card key={s.label} style={{ textAlign: 'center', padding: '16px 12px' }}>
              <div style={{ fontSize: 26 }}>{s.icon}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: s.color }}>{s.count}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.label}</div>
            </Card>
          ))}
        </div>

        {/* Filter */}
        <div style={{ marginBottom: 14 }}>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'white' }}>
            <option value="">Tất cả trạng thái</option>
            <option value="DRAFT">Nháp</option>
            <option value="PENDING_APPROVAL">Chờ duyệt</option>
            <option value="APPROVED">Đã duyệt</option>
            <option value="IN_TRANSIT">Đang vận chuyển</option>
            <option value="PENDING_QR_CONFIRM">Chờ QR xác nhận</option>
            <option value="COMPLETED">Hoàn thành</option>
          </select>
        </div>

        {/* Table */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {isLoading ? <Spinner /> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Mã phiếu','Loại','Từ → Đến','Số TS','Trạng thái','Ngày tạo','Thao tác'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map(order => (
                  <tr key={order.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '11px 14px', fontWeight: 800, color: '#1a2744' }}>{order.order_code}</td>
                    <td style={{ padding: '11px 14px', fontSize: 12 }}>{order.order_type}</td>
                    <td style={{ padding: '11px 14px', fontSize: 12 }}>
                      <div style={{ color: 'var(--muted)' }}>{order.from_location_name || '—'}</div>
                      <div style={{ color: '#2563eb', fontWeight: 600 }}>→ {order.to_location_name || '—'}</div>
                    </td>
                    <td style={{ padding: '11px 14px', fontWeight: 700, textAlign: 'center' }}>{order.item_count || 0}</td>
                    <td style={{ padding: '11px 14px' }}><StatusBadge status={order.status} /></td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--muted)' }}>{fmtDate(order.created_at)}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Btn variant="ghost" size="sm" onClick={() => navigate(`/transfers/${order.id}`)}>Xem</Btn>
                        {(order.status === 'DRAFT' || order.status === 'PENDING_APPROVAL') && (
                          <Btn variant="primary" size="sm" onClick={() => approve(order.id)}>✅ Duyệt</Btn>
                        )}
                        {order.status === 'APPROVED' && (
                          <Btn variant="accent" size="sm" onClick={() => dispatch(order.id)}>Xuất kho</Btn>
                        )}
                        {(order.status === 'IN_TRANSIT' || order.status === 'PENDING_QR_CONFIRM') && (
                          <Btn variant="outline" size="sm"
                            style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}
                            onClick={() => setQrModal(order)}>
                            📱 QR Xác nhận
                          </Btn>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      {qrModal && <QRConfirmModal order={qrModal} onClose={() => setQrModal(null)} />}
    </div>
  )
}
