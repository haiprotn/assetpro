import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import axios from 'axios'
import { Card, PageHeader, Btn, Spinner } from '../components/ui'

const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001/api/v1'
const api = axios.create({ baseURL: BASE })
api.interceptors.request.use(cfg => {
  const t = localStorage.getItem('access_token')
  if (t) cfg.headers.Authorization = `Bearer ${t}`
  return cfg
})

const DEPT_TYPES = [
  { value: 'ADMIN',      label: 'Hành chính' },
  { value: 'MANAGEMENT', label: 'Quản lý' },
  { value: 'PROJECT',    label: 'Dự án' },
  { value: 'OPERATIONS', label: 'Vận hành' },
]

function DeptModal({ dept, onClose, onSave }) {
  const [name, setName] = useState(dept?.name || '')
  const [code, setCode] = useState(dept?.code || '')
  const [type, setType] = useState(dept?.department_type || 'ADMIN')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!name.trim()) { setError('Vui lòng nhập tên phòng ban'); return }
    setSaving(true); setError('')
    try {
      if (dept?.id) {
        const r = await api.put(`/departments/${dept.id}`, { name, department_type: type })
        onSave(r.data)
      } else {
        const r = await api.post('/departments', { name, code: code || undefined, department_type: type })
        onSave(r.data)
      }
    } catch (e) {
      setError(e.response?.data?.detail || 'Lỗi lưu dữ liệu')
    } finally { setSaving(false) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'white', borderRadius: 14, width: 440, padding: 28 }}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 20 }}>
          {dept ? '✏️ Sửa phòng ban' : '➕ Thêm phòng ban'}
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>Tên phòng ban *</label>
          <input value={name} onChange={e => setName(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }}
            placeholder="VD: PHÒNG KỸ THUẬT" />
        </div>
        {!dept && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>Mã phòng ban (tự động nếu để trống)</label>
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }}
              placeholder="VD: KY_THUAT" />
          </div>
        )}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>Loại phòng ban</label>
          <select value={type} onChange={e => setType(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 13, background: 'white' }}>
            {DEPT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        {error && <div style={{ color: '#b91c1c', fontSize: 12, marginBottom: 12, background: '#fef2f2', padding: '8px 10px', borderRadius: 6 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={submit} disabled={saving} style={{
            padding: '9px 22px', background: '#1a2744', color: 'white',
            border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 13,
          }}>{saving ? '⏳ Đang lưu...' : '💾 Lưu'}</button>
          <button onClick={onClose} style={{
            padding: '9px 16px', background: '#f1f5f9', border: 'none',
            borderRadius: 7, cursor: 'pointer', fontSize: 13,
          }}>Huỷ</button>
        </div>
      </div>
    </div>
  )
}

export default function DepartmentsPage() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(null) // null | { dept? }
  const [deleting, setDeleting] = useState(null)
  const [error, setError] = useState('')

  const { data: depts = [], isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then(r => r.data),
  })

  const handleSave = () => { qc.invalidateQueries(['departments']); setModal(null) }

  const handleDelete = async (dept) => {
    if (!window.confirm(`Xóa phòng ban "${dept.name}"?`)) return
    setDeleting(dept.id); setError('')
    try {
      await api.delete(`/departments/${dept.id}`)
      qc.invalidateQueries(['departments'])
    } catch (e) {
      setError(e.response?.data?.detail || 'Lỗi xóa phòng ban')
    } finally { setDeleting(null) }
  }

  const typeLabel = v => DEPT_TYPES.find(t => t.value === v)?.label || v

  return (
    <div>
      {modal !== null && (
        <DeptModal
          dept={modal.dept}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      <PageHeader
        title="🏢 Quản lý Phòng ban"
        subtitle={`${depts.length} phòng ban trong hệ thống`}
        actions={
          <Btn variant="primary" onClick={() => setModal({})}>+ Thêm phòng ban</Btn>
        }
      />

      <div style={{ padding: 24 }}>
        {error && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>
            ⚠️ {error}
          </div>
        )}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {isLoading ? <Spinner /> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Mã', 'Tên phòng ban', 'Loại', 'Số tài sản', ''].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px', textAlign: 'left', fontSize: 11,
                      fontWeight: 700, color: 'var(--muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap'
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {depts.map(d => (
                  <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 16px', fontSize: 12, fontFamily: 'monospace', color: '#1a2744', fontWeight: 700 }}>{d.code}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, fontSize: 13 }}>{d.name}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        background: '#e0f2fe', color: '#0369a1',
                      }}>{typeLabel(d.department_type)}</span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span style={{
                        padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                        background: d.asset_count > 0 ? '#dcfce7' : '#f1f5f9',
                        color: d.asset_count > 0 ? '#15803d' : '#94a3b8',
                      }}>{d.asset_count}</span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Btn variant="ghost" size="sm" onClick={() => setModal({ dept: d })} style={{ marginRight: 6 }}>
                        ✏️ Sửa
                      </Btn>
                      <button
                        disabled={deleting === d.id || d.asset_count > 0}
                        onClick={() => handleDelete(d)}
                        title={d.asset_count > 0 ? 'Có tài sản, không thể xóa' : ''}
                        style={{
                          padding: '5px 12px', fontSize: 12, borderRadius: 6, cursor: d.asset_count > 0 ? 'not-allowed' : 'pointer',
                          background: d.asset_count > 0 ? '#f1f5f9' : '#fef2f2',
                          color: d.asset_count > 0 ? '#cbd5e1' : '#b91c1c',
                          border: 'none', fontWeight: 600, opacity: deleting === d.id ? 0.5 : 1,
                        }}>
                        🗑 Xóa
                      </button>
                    </td>
                  </tr>
                ))}
                {depts.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                    Chưa có phòng ban nào. Nhấn "+ Thêm phòng ban" để bắt đầu.
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  )
}
