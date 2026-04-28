import { useState, useRef } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { personnelApi } from '../services/api'
import PersonnelFormModal from './PersonnelFormModal'

const JOB_STATUS_LABEL = {
  PROBATION:   { label: 'Thử việc',    color: '#f59e0b', bg: '#fef3c7' },
  OFFICIAL:    { label: 'Chính thức',  color: '#16a34a', bg: '#dcfce7' },
  RESIGNED:    { label: 'Đã nghỉ',     color: '#dc2626', bg: '#fee2e2' },
  TERMINATED:  { label: 'Chấm dứt',   color: '#6b7280', bg: '#f3f4f6' },
}

function StatusBadge({ status }) {
  const s = JOB_STATUS_LABEL[status] || { label: status || '—', color: '#6b7280', bg: '#f3f4f6' }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 700, color: s.color, background: s.bg,
    }}>{s.label}</span>
  )
}

function Avatar({ name, photo }) {
  if (photo) return (
    <img src={photo} alt={name} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
  )
  const initials = name?.split(' ').slice(-2).map(w => w[0]).join('').toUpperCase() || '?'
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%', background: '#1a2744',
      color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 700, flexShrink: 0,
    }}>{initials}</div>
  )
}

export default function PersonnelPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [updateExisting, setUpdateExisting] = useState(false)
  const [hasHintRow, setHasHintRow] = useState(false)
  const importInputRef = useRef(null)

  const { data, isLoading } = useQuery({
    queryKey: ['personnel', page, search, filterStatus, filterDept],
    queryFn: () => personnelApi.list({
      page,
      page_size: 20,
      search: search || undefined,
      job_status: filterStatus || undefined,
      department_id: filterDept || undefined,
    }).then(r => r.data),
    keepPreviousData: true,
  })

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => import('../services/api').then(m => m.departmentApi.list().then(r => r.data)),
  })

  const { data: positions = [] } = useQuery({
    queryKey: ['positions-list'],
    queryFn: () => import('../services/api').then(m => m.personnelApi.listPositions().then(r => r.data)),
  })

  const posMap = Object.fromEntries(positions.map(p => [String(p.id), p.title]))

  const deleteMutation = useMutation({
    mutationFn: (id) => personnelApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['personnel'] })
      setConfirmDelete(null)
    },
  })

  const items = data?.items || []
  const total = data?.total || 0
  const totalPages = data?.total_pages || 0

  const handleSearch = (e) => { setSearch(e.target.value); setPage(1) }
  const handleOpenModal = (item = null) => { setEditItem(item); setShowModal(true) }
  const handleCloseModal = () => { setShowModal(false); setEditItem(null) }
  const handleSaved = () => { qc.invalidateQueries({ queryKey: ['personnel'] }); handleCloseModal() }

  const handleExport = async () => {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (filterStatus) params.set('job_status', filterStatus)
    if (filterDept) params.set('department_id', filterDept)
    const token = localStorage.getItem('access_token')
    const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001/api/v1'
    const res = await fetch(`${base}/personnel/export?${params}`, {
      headers: { Authorization: `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' },
    })
    if (!res.ok) return alert('Xuất file thất bại')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nhan_su_${new Date().toISOString().slice(0,10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadTemplate = async () => {
    const token = localStorage.getItem('access_token')
    const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001/api/v1'
    const res = await fetch(`${base}/personnel/import-template`, {
      headers: { Authorization: `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' },
    })
    if (!res.ok) return alert('Tải mẫu thất bại')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'mau_nhap_nhan_su.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    try {
      const res = await personnelApi.importExcel(file, updateExisting, hasHintRow)
      setImportResult(res.data)
      qc.invalidateQueries({ queryKey: ['personnel'] })
    } catch (err) {
      const detail = err.response?.data?.detail
      const msg = typeof detail === 'string' ? detail
        : Array.isArray(detail) ? detail.map(d => d.msg || JSON.stringify(d)).join('; ')
        : JSON.stringify(detail) || 'Import thất bại — kiểm tra file và thử lại'
      setImportResult({ error: msg })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1a2744' }}>👤 Quản lý nhân sự</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            Quản lý thông tin nhân viên, hợp đồng lao động
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Import */}
          <input ref={importInputRef} type="file" accept=".xlsx,.xls" onChange={handleImportFile} style={{ display: 'none' }} />
          <button
            onClick={handleDownloadTemplate}
            title="Tải file mẫu Excel"
            style={{ padding: '9px 14px', background: 'white', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >📄 Mẫu</button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <button
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
              style={{ padding: '9px 14px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            >{importing ? '⏳ Đang import...' : '📥 Import'}</button>
            <label style={{ fontSize: 10, color: '#64748b', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
              <input type="checkbox" checked={hasHintRow} onChange={e => setHasHintRow(e.target.checked)} style={{ width: 10, height: 10 }} />
              File từ mẫu hệ thống
            </label>
          </div>
          <button
            onClick={handleExport}
            style={{ padding: '9px 14px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >📤 Export</button>
          <button
            onClick={() => handleOpenModal()}
            style={{
              padding: '10px 20px', background: '#1a2744', color: 'white',
              border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >➕ Thêm nhân viên</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={handleSearch}
          placeholder="🔍 Tìm theo tên, mã NV, email..."
          style={{
            flex: '1 1 260px', padding: '9px 14px', borderRadius: 8,
            border: '1px solid #e2e8f0', fontSize: 13, outline: 'none',
          }}
        />
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
          style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: 'white', minWidth: 160 }}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="PROBATION">Thử việc</option>
          <option value="OFFICIAL">Chính thức</option>
          <option value="RESIGNED">Đã nghỉ</option>
          <option value="TERMINATED">Chấm dứt</option>
        </select>
        <select
          value={filterDept}
          onChange={e => { setFilterDept(e.target.value); setPage(1) }}
          style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: 'white', minWidth: 180 }}
        >
          <option value="">Tất cả phòng ban</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {/* Stats strip */}
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
        Tổng <strong style={{ color: '#1a2744' }}>{total}</strong> nhân viên
        {(search || filterStatus || filterDept) && ' (đã lọc)'}
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>⏳ Đang tải...</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>👤</div>
          <div>Chưa có nhân viên nào</div>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Nhân viên', 'Mã NV', 'Phòng ban', 'Vị trí / Chức danh', 'Liên hệ', 'Vào làm', 'Trạng thái', ''].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((p, i) => (
                <tr
                  key={p.id}
                  style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa', cursor: 'pointer' }}
                  onClick={() => navigate(`/personnel/${p.id}`)}
                >
                  {/* Tên + avatar */}
                  <td style={{ padding: '11px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={p.full_name} photo={p.photo_url} />
                      <div>
                        <div style={{ fontWeight: 700, color: '#1a2744' }}>{p.full_name}</div>
                        {p.email && <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.email}</div>}
                      </div>
                    </div>
                  </td>
                  {/* Mã */}
                  <td style={{ padding: '11px 14px', fontFamily: 'monospace', color: '#475569' }}>
                    {p.employee_code}
                  </td>
                  {/* Phòng ban */}
                  <td style={{ padding: '11px 14px', color: '#475569' }}>
                    {p.department_id ? <span style={{ fontSize: 12, background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 4 }}>
                      {departments.find(d => d.id === p.department_id)?.name || '—'}
                    </span> : '—'}
                  </td>
                  {/* Vị trí — ưu tiên position_id lookup, fallback về p.position text cũ */}
                  <td style={{ padding: '11px 14px', color: '#475569', fontSize: 12 }}>
                    {posMap[String(p.position_id)] || p.position || '—'}
                  </td>
                  {/* Liên hệ */}
                  <td style={{ padding: '11px 14px', color: '#475569', fontSize: 12 }}>
                    {p.phone || p.mobile || '—'}
                  </td>
                  {/* Ngày vào */}
                  <td style={{ padding: '11px 14px', color: '#475569', fontSize: 12 }}>
                    {p.job_date_join ? new Date(p.job_date_join).toLocaleDateString('vi-VN') : '—'}
                  </td>
                  {/* Trạng thái */}
                  <td style={{ padding: '11px 14px' }}>
                    <StatusBadge status={p.job_status} />
                  </td>
                  {/* Actions */}
                  <td style={{ padding: '11px 14px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={() => handleOpenModal(p)}
                        style={{ padding: '5px 10px', fontSize: 12, background: '#f1f5f9', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                        title="Sửa"
                      >✏️</button>
                      <button
                        onClick={() => setConfirmDelete(p)}
                        style={{ padding: '5px 10px', fontSize: 12, background: '#fef2f2', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                        title="Vô hiệu hóa"
                      >🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20 }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'white', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.4 : 1 }}
          >← Trước</button>
          {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
            const n = totalPages <= 7 ? i + 1 : Math.max(1, Math.min(page - 3, totalPages - 6)) + i
            return (
              <button
                key={n}
                onClick={() => setPage(n)}
                style={{
                  padding: '7px 12px', borderRadius: 7, border: '1px solid #e2e8f0',
                  background: page === n ? '#1a2744' : 'white',
                  color: page === n ? 'white' : '#374151',
                  cursor: 'pointer', fontWeight: page === n ? 700 : 400,
                }}
              >{n}</button>
            )
          })}
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'white', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.4 : 1 }}
          >Sau →</button>
        </div>
      )}

      {/* Modal thêm/sửa */}
      {showModal && (
        <PersonnelFormModal
          item={editItem}
          departments={departments}
          onClose={handleCloseModal}
          onSaved={handleSaved}
        />
      )}

      {/* Import result modal */}
      {importResult && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 28, width: 440, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 16 }}>
              {importResult.error ? '❌ Import thất bại' : '✅ Kết quả Import'}
            </div>
            {importResult.error ? (
              <p style={{ color: '#dc2626', fontSize: 14 }}>{importResult.error}</p>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                  {[
                    { label: 'Tổng dòng xử lý', value: importResult.total_rows, color: '#1a2744' },
                    { label: 'Thêm mới', value: importResult.created, color: '#16a34a' },
                    { label: 'Cập nhật', value: importResult.updated, color: '#2563eb' },
                    { label: 'Lỗi / Bỏ qua', value: importResult.errors?.length || 0, color: '#dc2626' },
                  ].map(s => (
                    <div key={s.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                {importResult.errors?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', marginBottom: 6 }}>Chi tiết lỗi:</div>
                    <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #fee2e2', borderRadius: 6 }}>
                      {importResult.errors.map((e, i) => (
                        <div key={i} style={{ padding: '6px 10px', fontSize: 12, borderBottom: '1px solid #fee2e2', color: '#475569' }}>
                          <span style={{ color: '#94a3b8', marginRight: 8 }}>Dòng {e.row}:</span>{e.error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {importResult.headers_found && (
                  <div style={{ marginTop: 10, fontSize: 11, color: '#94a3b8' }}>
                    Cột đọc được: {importResult.headers_found.join(', ')}...
                  </div>
                )}
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={updateExisting} onChange={e => setUpdateExisting(e.target.checked)} />
                    Cập nhật NV đã tồn tại ở lần import tiếp theo
                  </label>
                </div>
              </>
            )}
            <button
              onClick={() => setImportResult(null)}
              style={{ marginTop: 16, width: '100%', padding: '9px', background: '#1a2744', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700 }}
            >Đóng</button>
          </div>
        </div>
      )}

      {/* Confirm xóa */}
      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
        }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 28, width: 360 }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>⚠️ Xác nhận vô hiệu hóa</div>
            <p style={{ color: '#475569', fontSize: 14 }}>
              Vô hiệu hóa nhân viên <strong>{confirmDelete.full_name}</strong>?<br />
              Nhân viên sẽ không xuất hiện trong danh sách nhưng dữ liệu vẫn được giữ lại.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button
                onClick={() => deleteMutation.mutate(confirmDelete.id)}
                disabled={deleteMutation.isPending}
                style={{ padding: '9px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700 }}
              >{deleteMutation.isPending ? 'Đang xử lý...' : 'Vô hiệu hóa'}</button>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{ padding: '9px 16px', background: '#f1f5f9', border: 'none', borderRadius: 7, cursor: 'pointer' }}
              >Huỷ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
