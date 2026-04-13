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
  { key: 'documents', label: '📁 Tài liệu hồ sơ' },
]

const DOC_TYPES = [
  { value: 'ID_CARD',     label: 'CMND / CCCD',            icon: '🪪', color: '#3b82f6', bg: '#eff6ff' },
  { value: 'RESUME',      label: 'Sơ yếu lý lịch',         icon: '📋', color: '#8b5cf6', bg: '#f5f3ff' },
  { value: 'DEGREE',      label: 'Bằng cấp / Chứng chỉ',   icon: '🎓', color: '#0891b2', bg: '#ecfeff' },
  { value: 'HEALTH_CERT', label: 'Giấy khám sức khỏe',     icon: '🏥', color: '#16a34a', bg: '#f0fdf4' },
  { value: 'HOUSEHOLD',   label: 'Hộ khẩu / Hộ chiếu',     icon: '🏠', color: '#ea580c', bg: '#fff7ed' },
  { value: 'PROFILE',     label: 'Hồ sơ nhân viên',         icon: '🗂️', color: '#64748b', bg: '#f8fafc' },
  { value: 'CONTRACT',    label: 'Hợp đồng lao động',       icon: '📝', color: '#b45309', bg: '#fffbeb' },
  { value: 'PHOTO',       label: 'Ảnh',                     icon: '🖼️', color: '#db2777', bg: '#fdf2f8' },
  { value: 'OTHER',       label: 'Tài liệu khác',           icon: '📄', color: '#475569', bg: '#f8fafc' },
]

const DOC_TYPE_ICON = Object.fromEntries(DOC_TYPES.map(d => [d.value, d.icon]))

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
  const [uploadDocType, setUploadDocType] = useState('OTHER')
  const [uploadNotes, setUploadNotes] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadingType, setUploadingType] = useState(null)
  const [previewDoc, setPreviewDoc] = useState(null)
  const [dragOverType, setDragOverType] = useState(null)
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

  const doUpload = async (file, docType) => {
    if (!file) return
    setUploading(true)
    setUploadingType(docType)
    try {
      await personnelApi.uploadDocument(id, file, docType, '')
      refetchDocs()
    } catch (err) {
      alert(err.response?.data?.detail || 'Upload thất bại')
    } finally {
      setUploading(false)
      setUploadingType(null)
    }
  }

  const handleUploadDoc = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    await doUpload(file, uploadDocType)
  }

  const handleDrop = async (e, docType) => {
    e.preventDefault()
    setDragOverType(null)
    const file = e.dataTransfer.files?.[0]
    if (file) await doUpload(file, docType)
  }

  const deleteDocMutation = useMutation({
    mutationFn: (docId) => personnelApi.deleteDocument(docId),
    onSuccess: () => refetchDocs(),
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
          >{t.label}</button>
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
          {(person.education_level || person.professional_level || person.training_school || person.work_history) && (
            <Section title="Học vấn & Chuyên môn">
              <InfoRow label="Trình độ văn hóa"    value={person.education_level} />
              <InfoRow label="Trình độ chuyên môn"  value={person.professional_level} />
              <InfoRow label="Trường đào tạo"       value={person.training_school} />
              {person.work_history && (
                <div style={{ padding: '7px 0', borderBottom: '1px solid #f8fafc' }}>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>Quá trình học tập và công tác</div>
                  <div style={{ fontSize: 13, color: '#1a2744', whiteSpace: 'pre-wrap' }}>{person.work_history}</div>
                </div>
              )}
            </Section>
          )}

          {(person.tax_code || person.social_insurance_number || person.labor_contract_number || person.emergency_phone_1 || person.emergency_phone_2) && (
            <Section title="Bảo hiểm, Thuế & Khẩn cấp">
              <InfoRow label="MST cá nhân"           value={person.tax_code} />
              <InfoRow label="Số sổ BHXH"            value={person.social_insurance_number} />
              <InfoRow label="Số HĐLĐ"               value={person.labor_contract_number} />
              <InfoRow label="SĐT người thân (1)"    value={person.emergency_phone_1} />
              <InfoRow label="SĐT người thân (2)"    value={person.emergency_phone_2} />
            </Section>
          )}

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

      {/* Tab: Tài liệu hồ sơ */}
      {tab === 'documents' && (
        <div style={{ background: 'white', borderRadius: '0 0 12px 12px', border: '1px solid #e2e8f0', padding: '20px 24px' }}>
          <input ref={fileInputRef} type="file" onChange={handleUploadDoc} style={{ display: 'none' }}
            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx" />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {DOC_TYPES.map(dt => {
              const group = documents.filter(d => d.doc_type === dt.value)
              const isDragging = dragOverType === dt.value
              const isUploading = uploadingType === dt.value

              return (
                <div key={dt.value} style={{
                  border: `1px solid ${isDragging ? dt.color : '#e2e8f0'}`,
                  borderRadius: 10,
                  background: isDragging ? dt.bg : 'white',
                  transition: 'border-color 0.15s, background 0.15s',
                  overflow: 'hidden',
                }}
                  onDragOver={e => { e.preventDefault(); setDragOverType(dt.value) }}
                  onDragLeave={() => setDragOverType(null)}
                  onDrop={e => handleDrop(e, dt.value)}
                >
                  {/* Header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px',
                    background: group.length > 0 ? dt.bg : '#fafafa',
                    borderBottom: group.length > 0 ? `1px solid ${dt.color}22` : 'none',
                  }}>
                    <span style={{ fontSize: 18 }}>{dt.icon}</span>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1a2744' }}>{dt.label}</span>
                      {group.length > 0 && (
                        <span style={{
                          marginLeft: 8, fontSize: 11, fontWeight: 700,
                          color: dt.color, background: dt.bg,
                          border: `1px solid ${dt.color}44`,
                          padding: '1px 7px', borderRadius: 10,
                        }}>{group.length} file</span>
                      )}
                    </div>
                    <button
                      onClick={() => { setUploadDocType(dt.value); fileInputRef.current?.click() }}
                      disabled={uploading}
                      style={{
                        padding: '5px 12px', fontSize: 12, fontWeight: 700,
                        background: isUploading ? '#e2e8f0' : dt.color,
                        color: 'white', border: 'none', borderRadius: 6,
                        cursor: uploading ? 'not-allowed' : 'pointer',
                        opacity: uploading && !isUploading ? 0.5 : 1,
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      {isUploading ? '⏳' : '⬆️'} Upload
                    </button>
                  </div>

                  {/* File list */}
                  {group.length > 0 && (
                    <div>
                      {group.map((doc, i) => (
                        <div key={doc.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 14px',
                          borderBottom: i < group.length - 1 ? '1px solid #f1f5f9' : 'none',
                          background: i % 2 === 0 ? 'white' : '#fafafa',
                        }}>
                          {/* File icon / thumbnail */}
                          <div
                            onClick={() => setPreviewDoc(doc)}
                            style={{ width: 36, height: 36, borderRadius: 6, overflow: 'hidden', flexShrink: 0, cursor: 'pointer', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            {isImage(doc.file_type, doc.file_name) ? (
                              <img src={`${API_BASE}${doc.file_url}`} alt={doc.file_name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={e => { e.target.style.display = 'none' }} />
                            ) : (
                              <span style={{ fontSize: 18 }}>
                                {doc.file_name.endsWith('.pdf') ? '📄'
                                  : doc.file_name.match(/\.(doc|docx)$/) ? '📝'
                                  : doc.file_name.match(/\.(xls|xlsx)$/) ? '📊'
                                  : isImage(null, doc.file_name) ? '🖼️' : '📁'}
                              </span>
                            )}
                          </div>

                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              onClick={() => setPreviewDoc(doc)}
                              style={{ fontSize: 13, fontWeight: 600, color: '#1a2744', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={doc.file_name}
                            >
                              {doc.file_name}
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', gap: 8 }}>
                              {humanSize(doc.file_size_bytes) && <span>{humanSize(doc.file_size_bytes)}</span>}
                              {doc.notes && <span style={{ fontStyle: 'italic', color: '#64748b' }}>{doc.notes}</span>}
                              {doc.source === 'LINKED' && <span>🔗 File cũ</span>}
                            </div>
                          </div>

                          {/* Actions */}
                          <a href={`${API_BASE}${doc.file_url}`} target="_blank" rel="noreferrer" download={doc.file_name}
                            style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none', padding: '4px 10px', border: '1px solid #bfdbfe', borderRadius: 6, flexShrink: 0 }}>
                            ⬇️ Tải
                          </a>
                          <button
                            onClick={() => { if (window.confirm(`Xóa "${doc.file_name}"?`)) deleteDocMutation.mutate(doc.id) }}
                            style={{ padding: '4px 8px', fontSize: 12, color: '#dc2626', background: '#fef2f2', border: 'none', borderRadius: 6, cursor: 'pointer', flexShrink: 0 }}
                          >🗑️</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Drop hint (only when empty) */}
                  {group.length === 0 && (
                    <div style={{ padding: '10px 14px', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
                      {isDragging ? '📂 Thả file vào đây...' : 'Kéo thả file vào đây hoặc nhấn Upload'}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
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

    </div>
  )
}
