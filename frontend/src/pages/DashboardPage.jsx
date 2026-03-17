import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { dashboardApi, transferApi } from '../services/api'
import { Card, PageHeader, StatusBadge, fmtVnd, Spinner } from '../components/ui'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

const COLORS = ['#1a2744','#3b82f6','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899']

const StatCard = ({ icon, label, value, sub, color = '#1a2744' }) => (
  <Card style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
    <div style={{
      width: 50, height: 50, borderRadius: 12, background: color + '1a',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0
    }}>{icon}</div>
    <div>
      <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color, fontWeight: 600, marginTop: 2 }}>{sub}</div>}
    </div>
  </Card>
)

const AlertRow = ({ icon, label, count, color, assets = [] }) => {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (count <= 0) return null

  const handleClick = () => {
    if (assets.length === 1) {
      navigate(`/assets/${assets[0].id}`)
    } else {
      setOpen(o => !o)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div onClick={handleClick} style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
        background: color + '0f', border: `1px solid ${color}30`, borderRadius: 8, fontSize: 13,
        cursor: 'pointer', userSelect: 'none',
      }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ color, fontWeight: 700 }}>{count} {label}</span>
        {assets.length > 1 && <span style={{ color, fontSize: 11, marginLeft: 2 }}>▾</span>}
      </div>
      {open && assets.length > 1 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 100,
          background: 'var(--card-bg, #fff)', border: '1px solid var(--border)',
          borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          minWidth: 280, maxHeight: 280, overflowY: 'auto',
        }}>
          {assets.map(a => (
            <div key={a.id} onClick={() => { navigate(`/assets/${a.id}`); setOpen(false) }} style={{
              padding: '8px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
              fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
              onMouseEnter={e => e.currentTarget.style.background = color + '10'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span><strong>{a.code}</strong> — {a.name}</span>
              <span style={{ color: color, fontSize: 11, marginLeft: 8, whiteSpace: 'nowrap' }}>{a.expiry}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { data: summary, isLoading: loadSummary } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => dashboardApi.summary().then(r => r.data),
  })
  const { data: byLocation } = useQuery({
    queryKey: ['by-location'],
    queryFn: () => dashboardApi.byLocation().then(r => r.data),
  })
  const { data: alerts } = useQuery({
    queryKey: ['dashboard-alerts'],
    queryFn: () => dashboardApi.alerts().then(r => r.data),
  })
  const { data: transfers } = useQuery({
    queryKey: ['transfers-recent'],
    queryFn: () => transferApi.list({ page: 1, size: 8 }).then(r => r.data),
  })

  const today = new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const statusData = summary ? [
    { name: 'Chờ cấp phát', value: summary.pending, color: '#f59e0b' },
    { name: 'Đang sử dụng', value: summary.in_use, color: '#10b981' },
    { name: 'Đang bảo trì', value: summary.in_maintenance, color: '#ef4444' },
  ] : []

  return (
    <div>
      <PageHeader
        title="📊 Tổng quan hệ thống"
        subtitle={today}
        actions={<></>}
      />
      <div style={{ padding: 24 }}>
        {/* Alert banners */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          <AlertRow icon="🚨" color="#ef4444"
            count={alerts?.registration_expiry?.length || 0}
            label="tài sản hết hạn đăng kiểm"
            assets={alerts?.registration_expiry || []} />
          <AlertRow icon="⚠️" color="#f59e0b"
            count={alerts?.calibration_expiry?.length || 0}
            label="thiết bị sắp hết hạn hiệu chuẩn"
            assets={alerts?.calibration_expiry || []} />
        </div>

        {/* Stats */}
        {loadSummary ? <Spinner /> : (
          <div className="stat-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 20 }}>
            <StatCard icon="📦" label="Tổng tài sản" value={summary?.total_assets ?? '—'} color="#1a2744" />
            <StatCard icon="💰" label="Tổng nguyên giá"
              value={summary?.total_value ? fmtVnd(summary.total_value).replace('₫','đ') : '—'}
              sub="Nguyên giá gốc" color="#3b82f6" />
            <StatCard icon="✅" label="Đang sử dụng" value={summary?.in_use ?? '—'} color="#10b981" />
            <StatCard icon="⏳" label="Chờ cấp phát" value={summary?.pending ?? '—'} color="#f59e0b" />
          </div>
        )}

        <div className="chart-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          {/* Status chart */}
          <Card>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700 }}>Phân bổ trạng thái</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                  dataKey="value" paddingAngle={3}>
                  {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [v + ' tài sản', n]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          {/* By location */}
          <Card>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700 }}>Top công trường</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={(byLocation || []).slice(0, 8)} layout="vertical" margin={{ left: 30 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="location_name" tick={{ fontSize: 10 }} width={120} />
                <Tooltip />
                <Bar dataKey="asset_count" fill="#1a2744" radius={[0,4,4,0]} name="Tài sản" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Recent transfers */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Phiếu điều chuyển gần đây</h3>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Mã phiếu','Loại','Từ → Đến','Tài sản','Trạng thái','Ngày'].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(transfers) ? transfers : []).slice(0, 6).map((t, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '11px 14px', fontWeight: 700, color: '#1a2744' }}>{t.order_code}</td>
                  <td style={{ padding: '11px 14px' }}>{t.order_type}</td>
                  <td style={{ padding: '11px 14px', fontSize: 12 }}>
                    <div style={{ color: 'var(--muted)' }}>{t.from_location_name || '—'}</div>
                    <div style={{ color: '#2563eb', fontWeight: 600 }}>→ {t.to_location_name || '—'}</div>
                  </td>
                  <td style={{ padding: '11px 14px', fontWeight: 600 }}>{t.item_count || 0}</td>
                  <td style={{ padding: '11px 14px' }}><StatusBadge status={t.status} /></td>
                  <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--muted)' }}>
                    {t.created_at ? new Date(t.created_at).toLocaleDateString('vi-VN') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
