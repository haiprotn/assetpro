import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { personnelApi, departmentApi } from '../services/api'
import PersonnelFormModal from './PersonnelFormModal'

const JOB_STATUS_LABEL = {
  PROBATION:  { label: 'Thử việc',   color: '#f59e0b', bg: '#fef3c7' },
  OFFICIAL:   { label: 'Chính thức', color: '#16a34a', bg: '#dcfce7' },
  RESIGNED:   { label: 'Đã nghỉ',    color: '#dc2626', bg: '#fee2e2' },
  TERMINATED: { label: 'Chấm dứt',  color: '#6b7280', bg: '#f3f4f6' },
}

const CONTRACT_STATUS_LABEL = {
  ACTIVE:     { label: 'Hiệu lực',   color: '#16a34a', bg: '#dcfce7' },
  EXPIRED:    { label: 'Hết hạn',    color: '#f59e0b', bg: '#fef3c7' },
  LIQUIDATED: { label: 'Thanh lý',   color: '#6b7280', bg: '#f3f4f6' },
  PENDING:    { label: 'Chờ duyệt',  color: '#3b82f6', bg: '#eff6ff' },
}

const GENDER_LABEL = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' }
const MARITAL_LABEL = { SINGLE: 'Độc thân', MARRIED: 'Đã kết hôn', DIVORCED: 'Ly hôn', WIDOWED: 'Góa' }
const SALARY_METHOD_LABEL = { FIXED: 'Lương cố định', TIMESHEET: 'Theo công', PIECE: 'Khoán sản phẩm' }

function Badge({ value, map }) {
  const s = map[value] || { label: value || '—', color: '#6b7280', bg: '#f3f4f6' }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 700, color: s.color, background: s.bg,
    }}>{s.label}</span>
  )
}

function Avatar({ name, photo, size = 72 }) {
  if (photo) return (
    <img src={photo} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
  )
  const initials = name?.split(' ').slice(-2).map(w => w[0]).join('').toUpperCase() || '?'
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: '#1a2744',
      color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.28, fontWeight: 700, flexShrink: 0,
    }}>{initials}</div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
      <span style={{ width: 180, flexShrink: 0, fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#1a2744' }}>{value || <span style={{ color: '#cbd5e1' }}>—</span>}</span>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

const fmt = (dateStr) => dateStr ? new Date(dateStr).toLocaleDateString('vi-VN') : null
const fmtMoney = (val) => val != null ? Number(val).toLocaleString('vi-VN') + ' ₫' : null

const TABS = [
  { key: 'info',      label: '👤 Thông tin cá nhân' },
  { key: 'job',       label: '💼 Công việc' },
  { key: 'contracts', label: '📋 Hợp đồng' },
  { key: 'documents', label: '📁 Tài liệu hồ sơ' },
]

const DOC_TYPES = [
  { value: 'PHOTO',       label: 'Ảnh đại diện' },
  { value: 'ID_CARD',     label: 'CMND / CCCD' },
  { value: 'DEGREE',      label: 'Bằng cấp' },
  { value: 'CERTIFICATE', label: 'Chứng chỉ' },
  { value: 'CONTRACT',    label: 'Hợp đồng' },
  { value: 'PROFILE',     label: 'Hồ sơ nhân viên' },
  { value: 'OTHER',       label: 'Khác' },
]

const DOC_TYPE_ICON = {
  PHOTO: '🖼️', ID_CARD: '🪪', DEGREE: '🎓',
  CERTIFICATE: '📜', CONTRACT: '📝', PROFILE: '🗂️', OTHER: '📄',
}

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace('/api/v1', '') || 'http://localhost:8001'

function humanSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

function isImage(fileType, fileName) {
  if (fileType?.startsWith('image/')) return true
  const ext = (fileName || '').split('.').pop().toLowerCase()
  return ['jpg','jpeg','png','gif','webp'].includes(ext)
}

export default function PersonnelDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState('info')
  const [showEdit, setShowEdit] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [uploadDocType, setUploadDocType] = useState('OTHER')
  const [uploadNotes, setUploadNotes] = useState('')
  const [uploading, setUploading] = useState(false)
  const [previewDoc, setPreviewDoc] = useState(null)
  const fileInputRef = useRef(null)

  const { data: person, isLoading, isError } = useQuery({
    queryKey: ['personnel', id],
    queryFn: () => personnelApi.getById(id).then(r => r.data),
  })

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentApi.list().then(r => r.data),
  })

  const { data: documents = [], refetch: refetchDocs } = useQuery({
    queryKey: ['personnel-docs', id],
    queryFn: () => personnelApi.listDocuments(id).then(r => r.data),
    enabled: tab === 'documents',
  })

  const handleUploadDoc = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      await personnelApi.uploadDocument(id, file, uploadDocType, uploadNotes)
      refetchDocs()
      setUploadNotes('')
    } catch (err) {
      alert(err.response?.data?.detail || 'Upload thất bại')
    } finally {
      setUploading(false)
    }
  }

  const deleteDocMutation = useMutation({
    mutationFn: (docId) => personnelApi.deleteDocument(docId),
    onSuccess: () => refetchDocs(),
  })

  const deleteContractMutation = useMutation({
    mutationFn: (cid) => personnelApi.deleteContract(cid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['personnel', id] })
      setConfirmDelete(null)
    },
  })

  if (isLoading) return (
    <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>⏳ Đang tải...</div>
  )

  if (isError || !person) return (
    <div style={{ padding: 48, textAlign: 'center', color: '#dc2626' }}>
      Không tìm thấy nhân viên.{' '}
      <button onClick={() => navigate('/personnel')} style={{ background: 'none', border: 'none', color: '#1a2744', cursor: 'pointer', textDecoration: 'underline' }}>
        Quay lại
      </button>
    </div>
  )

  const dept = departments.find(d => d.id === person.department_id)

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900 }}>

      {/* Back */}
      <button
        onClick={() => navigate('/personnel')}
        style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13, padding: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 4 }}
      >
        ← Quay lại danh sách
      </button>

      {/* Profile header */}
      <div style={{
        background: 'white', borderRadius: 14, border: '1px solid #e2e8f0',
        padding: '20px 24px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 20,
      }}>
        <Avatar name={person.full_name} photo={person.photo_url} size={72} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#1a2744' }}>{person.full_name}</h1>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: 5 }}>
                  {person.employee_code}
                </span>
                {person.job_status && <Badge value={person.job_status} map={JOB_STATUS_LABEL} />}
                {!person.is_active && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#fef2f2', color: '#dc2626', fontWeight: 700 }}>
                    Vô hiệu hóa
                  </span>
                )}
              </div>
              {dept && <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>🏢 {dept.name}</div>}
              {person.position && <div style={{ fontSize: 12, color: '#64748b' }}>💼 {person.position}</div>}
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowEdit(true)}
          style={{
            padding: '9px 18px', background: '#1a2744', color: 'white',
            border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13,
            flexShrink: 0,
          }}
        >✏️ Chỉnh sửa</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 20, background: 'white', borderRadius: '10px 10px 0 0', padding: '0 16px' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '12px 16px', fontSize: 13, fontWeight: tab === t.key ? 700 : 400,
              color: tab === t.key ? '#1a2744' : '#64748b',
              border: 'none', borderBottom: tab === t.key ? '2px solid #1a2744' : '2px solid transparent',
              background: 'none', cursor: 'pointer',
            }}
          >{t.label}
            {t.key === 'contracts' && person.contracts?.length > 0 && (
              <span style={{ marginLeft: 6, background: '#e2e8f0', color: '#475569', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
                {person.contracts.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Thông tin cá nhân */}
      {tab === 'info' && (
        <div style={{ background: 'white', borderRadius: '0 0 12px 12px', border: '1px solid #e2e8f0', padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
            <div>
              <Section title="Thông tin cơ bản">
                <InfoRow label="Họ và tên" value={person.full_name} />
                <InfoRow label="Ngày sinh" value={fmt(person.birthday)} />
                <InfoRow label="Giới tính" value={GENDER_LABEL[person.gender]} />
                <InfoRow label="Tình trạng hôn nhân" value={MARITAL_LABEL[person.marital_status]} />
                <InfoRow label="Quốc tịch" value={person.nationality} />
                <InfoRow label="Dân tộc" value={person.ethnicity} />
              </Section>
              <Section title="Giấy tờ">
                <InfoRow label="Số CMND/CCCD" value={person.private_code} />
                <InfoRow label="Ngày cấp" value={fmt(person.private_code_date)} />
                <InfoRow label="Nơi cấp" value={person.private_code_place} />
              </Section>
            </div>
            <div>
              <Section title="Liên hệ">
                <InfoRow label="Email" value={person.email} />
                <InfoRow label="Điện thoại" value={person.phone} />
                <InfoRow label="Di động" value={person.mobile} />
                <InfoRow label="Địa chỉ thường trú" value={person.home_address} />
                <InfoRow label="Địa chỉ hiện tại" value={person.current_address} />
              </Section>
            </div>
          </div>
          {person.description && (
            <Section title="Ghi chú">
              <div style={{ fontSize: 13, color: '#475569', whiteSpace: 'pre-wrap' }}>{person.description}</div>
            </Section>
          )}
        </div>
      )}

      {/* Tab: Công việc */}
      {tab === 'job' && (
        <div style={{ background: 'white', borderRadius: '0 0 12px 12px', border: '1px solid #e2e8f0', padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
            <Section title="Thông tin làm việc">
              <InfoRow label="Phòng ban" value={dept?.name} />
              <InfoRow label="Vị trí công việc" value={person.position} />
              <InfoRow label="Trạng thái lao động" value={
                person.job_status
                  ? <Badge value={person.job_status} map={JOB_STATUS_LABEL} />
                  : null
              } />
              <InfoRow label="Ngày vào làm" value={fmt(person.job_date_join)} />
              <InfoRow label="Ngày bắt đầu thử việc" value={fmt(person.job_date_try)} />
              <InfoRow label="Ngày chính thức" value={fmt(person.job_reldate_join)} />
              {person.job_date_out && <InfoRow label="Ngày nghỉ việc" value={fmt(person.job_date_out)} />}
              {person.job_out_reason && <InfoRow label="Lý do nghỉ" value={person.job_out_reason} />}
            </Section>
            <Section title="Lương">
              <InfoRow label="Hình thức lương" value={SALARY_METHOD_LABEL[person.salary_method]} />
              <InfoRow label="Mức lương thực nhận" value={fmtMoney(person.salary_real)} />
            </Section>
          </div>
        </div>
      )}

      {/* Tab: Hợp đồng */}
      {tab === 'contracts' && (
        <div style={{ background: 'white', borderRadius: '0 0 12px 12px', border: '1px solid #e2e8f0', padding: '20px 24px' }}>
          {(!person.contracts || person.contracts.length === 0) ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
              <div>Chưa có hợp đồng nào</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['Số hợp đồng', 'Loại hợp đồng', 'Từ ngày', 'Đến ngày', 'Lương', 'Phụ cấp', 'Trạng thái', ''].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {person.contracts.map((c, i) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#1a2744', fontWeight: 600 }}>{c.contract_code}</td>
                      <td style={{ padding: '10px 12px', color: '#475569' }}>{c.contract_type?.title || '—'}</td>
                      <td style={{ padding: '10px 12px', color: '#475569' }}>{fmt(c.date_start)}</td>
                      <td style={{ padding: '10px 12px', color: '#475569' }}>{c.date_finish ? fmt(c.date_finish) : <span style={{ color: '#94a3b8' }}>Không xác định</span>}</td>
                      <td style={{ padding: '10px 12px', color: '#475569' }}>{c.salary ? Number(c.salary).toLocaleString('vi-VN') + ' ₫' : '—'}</td>
                      <td style={{ padding: '10px 12px', color: '#475569' }}>{c.salary_allowances ? Number(c.salary_allowances).toLocaleString('vi-VN') + ' ₫' : '—'}</td>
                      <td style={{ padding: '10px 12px' }}><Badge value={c.status} map={CONTRACT_STATUS_LABEL} /></td>
                      <td style={{ padding: '10px 12px' }}>
                        <button
                          onClick={() => setConfirmDelete(c)}
                          style={{ padding: '4px 8px', fontSize: 11, background: '#fef2f2', border: 'none', borderRadius: 5, cursor: 'pointer', color: '#dc2626' }}
                          title="Xóa hợp đồng"
                        >🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Tài liệu hồ sơ */}
      {tab === 'documents' && (
        <div style={{ background: 'white', borderRadius: '0 0 12px 12px', border: '1px solid #e2e8f0', padding: '20px 24px' }}>
          {/* Upload bar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Loại tài liệu</label>
              <select
                value={uploadDocType} onChange={e => setUploadDocType(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 13 }}
              >
                {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 160 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Ghi chú (tuỳ chọn)</label>
              <input
                value={uploadNotes} onChange={e => setUploadNotes(e.target.value)}
                placeholder="Mô tả tài liệu..."
                style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 13 }}
              />
            </div>
            <input ref={fileInputRef} type="file" onChange={handleUploadDoc} style={{ display: 'none' }}
              accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{ padding: '9px 18px', background: '#1a2744', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
            >{uploading ? '⏳ Đang upload...' : '⬆️ Upload tài liệu'}</button>
          </div>

          {documents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📁</div>
              <div>Chưa có tài liệu nào</div>
            </div>
          ) : (
            // Group by doc_type
            DOC_TYPES.map(dt => {
              const group = documents.filter(d => d.doc_type === dt.value)
              if (!group.length) return null
              return (
                <div key={dt.value} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                    {DOC_TYPE_ICON[dt.value]} {dt.label} ({group.length})
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                    {group.map(doc => (
                      <div key={doc.id} style={{
                        border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden',
                        background: '#fafafa', display: 'flex', flexDirection: 'column',
                      }}>
                        {/* Thumbnail */}
                        <div
                          onClick={() => setPreviewDoc(doc)}
                          style={{ height: 90, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden' }}
                        >
                          {isImage(doc.file_type, doc.file_name) ? (
                            <img
                              src={`${API_BASE}${doc.file_url}`}
                              alt={doc.file_name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={e => { e.target.style.display = 'none' }}
                            />
                          ) : (
                            <span style={{ fontSize: 32 }}>
                              {doc.file_name.endsWith('.pdf') ? '📄'
                                : doc.file_name.match(/\.(doc|docx)$/) ? '📝'
                                : doc.file_name.match(/\.(xls|xlsx)$/) ? '📊' : '📁'}
                            </span>
                          )}
                        </div>
                        {/* Info */}
                        <div style={{ padding: '8px 8px 6px' }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#1a2744', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.file_name}>
                            {doc.file_name}
                          </div>
                          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{humanSize(doc.file_size_bytes)}</div>
                          {doc.notes && <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, fontStyle: 'italic' }}>{doc.notes}</div>}
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>{doc.source === 'LINKED' ? '🔗 File cũ' : '⬆️ Upload'}</div>
                        </div>
                        {/* Actions */}
                        <div style={{ display: 'flex', borderTop: '1px solid #f1f5f9', padding: '4px 6px', gap: 4 }}>
                          <a
                            href={`${API_BASE}${doc.file_url}`}
                            download={doc.file_name}
                            target="_blank" rel="noreferrer"
                            style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#2563eb', textDecoration: 'none', padding: '3px 0' }}
                          >⬇️ Tải</a>
                          <button
                            onClick={() => { if (window.confirm(`Xóa "${doc.file_name}"?`)) deleteDocMutation.mutate(doc.id) }}
                            style={{ flex: 1, fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: '3px 0' }}
                          >🗑️ Xóa</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Preview modal */}
      {previewDoc && (
        <div
          onClick={() => setPreviewDoc(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', position: 'relative' }}>
            {isImage(previewDoc.file_type, previewDoc.file_name) ? (
              <img src={`${API_BASE}${previewDoc.file_url}`} alt={previewDoc.file_name}
                style={{ maxWidth: '85vw', maxHeight: '85vh', borderRadius: 8, display: 'block' }} />
            ) : (
              <iframe src={`${API_BASE}${previewDoc.file_url}`} title={previewDoc.file_name}
                style={{ width: '80vw', height: '80vh', border: 'none', borderRadius: 8, background: 'white' }} />
            )}
            <button onClick={() => setPreviewDoc(null)}
              style={{ position: 'absolute', top: -12, right: -12, background: 'white', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontWeight: 800, fontSize: 16 }}>×</button>
            <div style={{ color: 'white', textAlign: 'center', marginTop: 8, fontSize: 13 }}>{previewDoc.file_name}</div>
          </div>
        </div>
      )}

      {/* Modal edit */}
      {showEdit && (
        <PersonnelFormModal
          item={person}
          departments={departments}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['personnel', id] })
            qc.invalidateQueries({ queryKey: ['personnel'] })
            setShowEdit(false)
          }}
        />
      )}

      {/* Confirm xóa hợp đồng */}
      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
        }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 28, width: 360 }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>⚠️ Xóa hợp đồng</div>
            <p style={{ color: '#475569', fontSize: 14 }}>
              Xóa hợp đồng <strong>{confirmDelete.contract_code}</strong>?<br />
              Hành động này không thể khôi phục.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button
                onClick={() => deleteContractMutation.mutate(confirmDelete.id)}
                disabled={deleteContractMutation.isPending}
                style={{ padding: '9px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700 }}
              >{deleteContractMutation.isPending ? 'Đang xóa...' : 'Xóa'}</button>
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
