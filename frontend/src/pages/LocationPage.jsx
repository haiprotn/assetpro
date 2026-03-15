import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { locationApi } from '../services/api'
import { Card, PageHeader, Btn } from '../components/ui'

const inp = {
  width: '100%', padding: '8px 10px', borderRadius: 7,
  border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box',
}

function LocationForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    address: initial?.address || '',
    province: initial?.province || '',
    location_type: initial?.location_type || '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', padding: 16, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Tên vị trí *</label>
        <input style={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="VD: Kho A, Chi nhánh HN..." autoFocus />
      </div>
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Loại vị trí</label>
        <select style={{ ...inp, background: 'white' }} value={form.location_type} onChange={e => set('location_type', e.target.value)}>
          <option value="">-- Chọn loại --</option>
          <option value="WAREHOUSE">Kho</option>
          <option value="OFFICE">Văn phòng</option>
          <option value="BRANCH">Chi nhánh</option>
          <option value="SITE">Công trường</option>
          <option value="OTHER">Khác</option>
        </select>
      </div>
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Tỉnh / Thành phố</label>
        <input style={inp} value={form.province} onChange={e => set('province', e.target.value)} placeholder="VD: Hà Nội, TP.HCM..." />
      </div>
      <div>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Địa chỉ</label>
        <input style={inp} value={form.address} onChange={e => set('address', e.target.value)} placeholder="Địa chỉ chi tiết..." />
      </div>
      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="outline" onClick={onCancel}>Huỷ</Btn>
        <Btn variant="primary" onClick={() => form.name.trim() && onSave(form)} disabled={saving || !form.name.trim()}>
          {saving ? 'Đang lưu...' : (initial ? 'Cập nhật' : 'Thêm vị trí')}
        </Btn>
      </div>
    </div>
  )
}

const TYPE_LABEL = {
  WAREHOUSE: 'Kho', OFFICE: 'Văn phòng', BRANCH: 'Chi nhánh', SITE: 'Công trường', OTHER: 'Khác',
}

export default function LocationPage() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState(null)
  const [q, setQ] = useState('')

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationApi.list().then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: (data) => locationApi.create(data),
    onSuccess: () => { qc.invalidateQueries(['locations']); setShowAdd(false) },
    onError: (e) => alert('Lỗi: ' + (e.response?.data?.detail || e.message)),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => locationApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries(['locations']); setEditId(null) },
    onError: (e) => alert('Lỗi: ' + (e.response?.data?.detail || e.message)),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => locationApi.delete(id),
    onSuccess: () => qc.invalidateQueries(['locations']),
    onError: (e) => alert('Lỗi: ' + (e.response?.data?.detail || e.message)),
  })

  const filtered = locations.filter(l =>
    !q || l.name?.toLowerCase().includes(q.toLowerCase()) ||
    l.province?.toLowerCase().includes(q.toLowerCase()) ||
    l.address?.toLowerCase().includes(q.toLowerCase())
  )

  return (
    <div>
      <PageHeader
        title="📍 Quản lý vị trí"
        subtitle={`${locations.length} vị trí trong hệ thống`}
        actions={<Btn variant="primary" onClick={() => { setShowAdd(true); setEditId(null) }}>+ Thêm vị trí</Btn>}
      />
      <div style={{ padding: 24 }}>
        {showAdd && (
          <div style={{ marginBottom: 16 }}>
            <LocationForm
              onSave={(data) => createMut.mutate(data)}
              onCancel={() => setShowAdd(false)}
              saving={createMut.isPending}
            />
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="🔍 Tìm tên, tỉnh, địa chỉ..."
            style={{ ...inp, maxWidth: 360 }}
          />
        </div>

        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Đang tải...</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Tên vị trí', 'Loại', 'Tỉnh / TP', 'Địa chỉ', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(loc => (
                  <tr key={loc.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    {editId === loc.id ? (
                      <td colSpan={5} style={{ padding: '10px 14px' }}>
                        <LocationForm
                          initial={loc}
                          onSave={(data) => updateMut.mutate({ id: loc.id, data })}
                          onCancel={() => setEditId(null)}
                          saving={updateMut.isPending}
                        />
                      </td>
                    ) : (
                      <>
                        <td style={{ padding: '11px 14px', fontWeight: 600 }}>📍 {loc.name}</td>
                        <td style={{ padding: '11px 14px', color: '#64748b', fontSize: 12 }}>
                          {TYPE_LABEL[loc.location_type] || loc.location_type || '—'}
                        </td>
                        <td style={{ padding: '11px 14px', color: '#64748b', fontSize: 12 }}>{loc.province || '—'}</td>
                        <td style={{ padding: '11px 14px', color: '#94a3b8', fontSize: 12 }}>{loc.address || '—'}</td>
                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                          <Btn variant="ghost" size="sm" onClick={() => { setEditId(loc.id); setShowAdd(false) }}>✏️</Btn>
                          <Btn variant="ghost" size="sm" style={{ color: '#ef4444', marginLeft: 4 }}
                            onClick={() => window.confirm(`Xoá vị trí "${loc.name}"?`) && deleteMut.mutate(loc.id)}>
                            🗑️
                          </Btn>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                    {q ? 'Không tìm thấy vị trí phù hợp' : 'Chưa có vị trí nào'}
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
