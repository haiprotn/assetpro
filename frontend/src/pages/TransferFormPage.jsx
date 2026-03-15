import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { transferApi, locationApi, deptApi, personnelApi, assetApi } from '../services/api'
import { Card, PageHeader, Btn } from '../components/ui'
import toast from 'react-hot-toast'

const ORDER_TYPES = [
  { value: 'ALLOCATION',      label: 'Cấp phát',    color: '#10b981', desc: 'Xuất tài sản từ kho cấp cho bộ phận / cá nhân' },
  { value: 'RECOVERY',        label: 'Thu hồi',     color: '#f59e0b', desc: 'Thu tài sản về kho từ bộ phận / cá nhân' },
  { value: 'TRANSFER',        label: 'Điều chuyển', color: '#3b82f6', desc: 'Chuyển tài sản giữa các địa điểm / phòng ban' },
  { value: 'MAINTENANCE_OUT', label: 'Gửi bảo trì', color: '#8b5cf6', desc: 'Chuyển tài sản ra ngoài để bảo trì / sửa chữa' },
  { value: 'LIQUIDATION',     label: 'Thanh lý',    color: '#ef4444', desc: 'Loại bỏ tài sản khỏi vòng quản lý' },
]

const inp = {
  width: '100%', padding: '8px 10px', borderRadius: 7,
  border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box', outline: 'none',
}
const sel = { ...inp, background: 'white', cursor: 'pointer' }

function Label({ children, required }) {
  return (
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
      {children}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
    </label>
  )
}

export default function TransferFormPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [form, setForm] = useState({
    order_type: 'ALLOCATION',
    from_location_id: '', to_location_id: '',
    from_department_id: '', to_department_id: '',
    assigned_personnel_id: '',
    planned_date: '', reason: '', notes: '',
  })
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [errors, setErrors] = useState({})

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: locations = [] }  = useQuery({ queryKey: ['locations'],  queryFn: () => locationApi.list().then(r => r.data) })
  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: () => deptApi.list().then(r => r.data) })
  const { data: personnel = [] }   = useQuery({ queryKey: ['personnel'],   queryFn: () => personnelApi.list().then(r => r.data) })

  const { data: searchData, isFetching: searching } = useQuery({
    queryKey: ['assets-search', search],
    queryFn: () => assetApi.list({ q: search, page: 1, size: 20 }).then(r => {
      const d = r.data; return Array.isArray(d) ? d : (d.items || [])
    }),
    enabled: search.length >= 2,
  })
  const searchResults = searchData || []

  const addItem = (asset) => {
    if (items.find(i => i.asset_id === asset.id)) { toast('Tài sản này đã có trong danh sách', { icon: 'ℹ️' }); return }
    setItems(prev => [...prev, { asset_id: asset.id, asset_code: asset.asset_code, name: asset.name, quantity: 1, condition_before: '' }])
    setSearch('')
    setErrors(e => ({ ...e, items: undefined }))
  }
  const removeItem = (id) => setItems(prev => prev.filter(i => i.asset_id !== id))
  const updateItem = (id, field, val) => setItems(prev => prev.map(i => i.asset_id === id ? { ...i, [field]: val } : i))

  const validate = () => {
    const e = {}
    if (!form.order_type) e.order_type = 'Bắt buộc'
    if (items.length === 0) e.items = 'Cần ít nhất 1 tài sản'
    setErrors(e); return Object.keys(e).length === 0
  }

  const createMutation = useMutation({
    mutationFn: (data) => transferApi.create(data),
    onSuccess: (res) => {
      toast.success('Tạo phiếu điều chuyển thành công!')
      qc.invalidateQueries(['transfers'])
      navigate(`/transfers/${res.data.id}`)
    },
    onError: (e) => toast.error('Lỗi: ' + (e.response?.data?.detail || e.message)),
  })

  const handleSubmit = () => {
    if (!validate()) return
    createMutation.mutate({
      order_type: form.order_type,
      from_location_id: form.from_location_id || null,
      to_location_id: form.to_location_id || null,
      from_department_id: form.from_department_id || null,
      to_department_id: form.to_department_id || null,
      assigned_personnel_id: form.assigned_personnel_id || null,
      planned_date: form.planned_date || null,
      reason: form.reason || null,
      notes: form.notes || null,
      items: items.map(i => ({ asset_id: i.asset_id, quantity: parseInt(i.quantity) || 1, condition_before: i.condition_before || null })),
    })
  }

  const typeInfo = ORDER_TYPES.find(t => t.value === form.order_type)

  return (
    <div>
      <PageHeader
        title="➕ Tạo phiếu điều chuyển"
        subtitle={typeInfo?.desc}
        actions={
          <>
            <Btn variant="outline" onClick={() => navigate('/transfers')}>← Huỷ</Btn>
            <Btn variant="primary" onClick={handleSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending ? '⏳ Đang tạo...' : '💾 Tạo phiếu (Nháp)'}
            </Btn>
          </>
        }
      />
      <div style={{ padding: 24, maxWidth: 1000 }}>

        {/* Loại phiếu */}
        <Card style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#1a2744', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
            📋 Loại phiếu
            {errors.order_type && <span style={{ fontSize: 11, color: '#ef4444', marginLeft: 12, fontWeight: 400 }}>{errors.order_type}</span>}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {ORDER_TYPES.map(t => (
              <div key={t.value} onClick={() => set('order_type', t.value)} style={{
                padding: '14px 10px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                border: `2px solid ${form.order_type === t.value ? t.color : '#e2e8f0'}`,
                background: form.order_type === t.value ? t.color + '18' : 'white',
                transition: 'all 0.15s',
              }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: form.order_type === t.value ? t.color : '#475569' }}>
                  {t.label}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Hành trình & thông tin */}
        <Card style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#1a2744', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
            🗺️ Hành trình & thông tin
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
            <div style={{ marginBottom: 12 }}>
              <Label>Địa điểm xuất phát</Label>
              <select value={form.from_location_id} onChange={e => set('from_location_id', e.target.value)} style={sel}>
                <option value="">-- Kho / Địa điểm nguồn --</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <Label>Địa điểm đích</Label>
              <select value={form.to_location_id} onChange={e => set('to_location_id', e.target.value)} style={sel}>
                <option value="">-- Kho / Địa điểm đích --</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <Label>Phòng ban xuất</Label>
              <select value={form.from_department_id} onChange={e => set('from_department_id', e.target.value)} style={sel}>
                <option value="">-- Phòng ban nguồn --</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <Label>Phòng ban nhận</Label>
              <select value={form.to_department_id} onChange={e => set('to_department_id', e.target.value)} style={sel}>
                <option value="">-- Phòng ban nhận --</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <Label>Người nhận / Phụ trách</Label>
              <select value={form.assigned_personnel_id} onChange={e => set('assigned_personnel_id', e.target.value)} style={sel}>
                <option value="">-- Chọn nhân sự --</option>
                {personnel.map(p => <option key={p.id} value={p.id}>{p.full_name || p.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <Label>Ngày dự kiến thực hiện</Label>
              <input type="date" value={form.planned_date} onChange={e => set('planned_date', e.target.value)} style={inp} />
            </div>
            <div style={{ marginBottom: 12, gridColumn: '1 / -1' }}>
              <Label>Lý do điều chuyển</Label>
              <input value={form.reason} onChange={e => set('reason', e.target.value)} style={inp} placeholder="Nêu lý do điều chuyển..." />
            </div>
            <div style={{ marginBottom: 4, gridColumn: '1 / -1' }}>
              <Label>Ghi chú</Label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                style={{ ...inp, height: 60, resize: 'vertical' }} placeholder="Ghi chú thêm..." />
            </div>
          </div>
        </Card>

        {/* Asset picker */}
        <Card style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#1a2744', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
            📦 Danh sách tài sản cần điều chuyển
            {errors.items && <span style={{ fontSize: 11, color: '#ef4444', marginLeft: 12, fontWeight: 400 }}>{errors.items}</span>}
          </h3>

          <div style={{ position: 'relative', marginBottom: 14 }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Tìm tài sản theo mã hoặc tên (nhập ≥ 2 ký tự)..."
              style={{ ...inp, paddingRight: 40 }}
            />
            {searching && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--muted)' }}>⏳</span>}
            {search.length >= 2 && searchResults.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                background: 'white', border: '1px solid #e2e8f0', borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 260, overflowY: 'auto',
              }}>
                {searchResults.map(a => {
                  const already = items.some(i => i.asset_id === a.id)
                  return (
                    <div key={a.id} onClick={() => !already && addItem(a)} style={{
                      padding: '10px 14px', cursor: already ? 'default' : 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      borderBottom: '1px solid #f1f5f9', fontSize: 13, opacity: already ? 0.5 : 1,
                    }}
                      onMouseEnter={e => { if (!already) e.currentTarget.style.background = '#f0f9ff' }}
                      onMouseLeave={e => { if (!already) e.currentTarget.style.background = 'white' }}
                    >
                      <span><strong>{a.asset_code}</strong> — {a.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{already ? '✓ Đã thêm' : (a.status || '')}</span>
                    </div>
                  )
                })}
              </div>
            )}
            {search.length >= 2 && !searching && searchResults.length === 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                background: 'white', border: '1px solid #e2e8f0', borderRadius: 8,
                padding: '12px 14px', fontSize: 13, color: 'var(--muted)',
              }}>
                Không tìm thấy tài sản nào khớp với "{search}"
              </div>
            )}
          </div>

          {items.length > 0 ? (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Mã TS', 'Tên tài sản', 'Số lượng', 'Tình trạng trước khi xuất', ''].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.asset_id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 800, color: '#1a2744' }}>{item.asset_code}</td>
                      <td style={{ padding: '8px 12px' }}>{item.name}</td>
                      <td style={{ padding: '8px 12px', width: 80 }}>
                        <input type="number" min={1} value={item.quantity}
                          onChange={e => updateItem(item.asset_id, 'quantity', e.target.value)}
                          style={{ ...inp, width: 64, padding: '4px 6px' }} />
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <input value={item.condition_before}
                          onChange={e => updateItem(item.asset_id, 'condition_before', e.target.value)}
                          placeholder="Mô tả tình trạng..." style={{ ...inp, padding: '4px 8px' }} />
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <button onClick={() => removeItem(item.asset_id)}
                          style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '10px 12px', background: '#f0fdf4', borderRadius: '0 0 8px 8px', fontSize: 12, color: '#15803d', fontWeight: 600 }}>
                ✓ {items.length} tài sản — tổng {items.reduce((s, i) => s + (parseInt(i.quantity) || 0), 0)} đơn vị
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--muted)', fontSize: 13 }}>
              Chưa có tài sản nào. Tìm kiếm và nhấp để thêm vào danh sách.
            </div>
          )}
        </Card>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingBottom: 32 }}>
          <Btn variant="outline" onClick={() => navigate('/transfers')}>← Huỷ</Btn>
          <Btn variant="primary" onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? '⏳ Đang tạo...' : '💾 Tạo phiếu (Nháp)'}
          </Btn>
        </div>
      </div>
    </div>
  )
}
