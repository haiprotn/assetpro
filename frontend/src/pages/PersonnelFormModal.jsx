import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { personnelApi } from '../services/api'

const GENDER_OPTIONS = [
  { value: '', label: '-- Chọn --' },
  { value: 'MALE', label: 'Nam' },
  { value: 'FEMALE', label: 'Nữ' },
  { value: 'OTHER', label: 'Khác' },
]

const MARITAL_OPTIONS = [
  { value: '', label: '-- Chọn --' },
  { value: 'SINGLE', label: 'Độc thân' },
  { value: 'MARRIED', label: 'Đã kết hôn' },
  { value: 'DIVORCED', label: 'Ly hôn' },
  { value: 'WIDOWED', label: 'Góa' },
]

const JOB_STATUS_OPTIONS = [
  { value: '', label: '-- Chọn --' },
  { value: 'PROBATION', label: 'Thử việc' },
  { value: 'OFFICIAL', label: 'Chính thức' },
  { value: 'RESIGNED', label: 'Đã nghỉ' },
  { value: 'TERMINATED', label: 'Chấm dứt' },
]

const SALARY_METHOD_OPTIONS = [
  { value: '', label: '-- Chọn --' },
  { value: 'FIXED', label: 'Lương cố định' },
  { value: 'TIMESHEET', label: 'Theo công' },
  { value: 'PIECE', label: 'Khoán sản phẩm' },
]

const FORM_TABS = [
  { key: 'personal', label: '👤 Cá nhân' },
  { key: 'contact',  label: '📞 Liên hệ' },
  { key: 'job',      label: '💼 Công việc' },
  { key: 'salary',   label: '💰 Lương & Mô tả' },
  { key: 'docs',     label: '📁 Tài liệu' },
]

const DOC_TYPES = [
  { value: 'ID_CARD',     label: 'CMND / CCCD',           icon: '🪪', color: '#3b82f6', bg: '#eff6ff' },
  { value: 'RESUME',      label: 'Sơ yếu lý lịch',        icon: '📋', color: '#8b5cf6', bg: '#f5f3ff' },
  { value: 'DEGREE',      label: 'Bằng cấp / Chứng chỉ',  icon: '🎓', color: '#0891b2', bg: '#ecfeff' },
  { value: 'HEALTH_CERT', label: 'Giấy khám sức khỏe',    icon: '🏥', color: '#16a34a', bg: '#f0fdf4' },
  { value: 'HOUSEHOLD',   label: 'Hộ khẩu / Hộ chiếu',    icon: '🏠', color: '#ea580c', bg: '#fff7ed' },
  { value: 'PROFILE',     label: 'Hồ sơ nhân viên',        icon: '🗂️', color: '#64748b', bg: '#f8fafc' },
  { value: 'CONTRACT',    label: 'Hợp đồng lao động',      icon: '📝', color: '#b45309', bg: '#fffbeb' },
  { value: 'PHOTO',       label: 'Ảnh',                    icon: '🖼️', color: '#db2777', bg: '#fdf2f8' },
  { value: 'OTHER',       label: 'Tài liệu khác',          icon: '📄', color: '#475569', bg: '#f8fafc' },
]

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
  return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)
}

function fileIcon(fileName) {
  if (fileName.endsWith('.pdf')) return '📄'
  if (fileName.match(/\.(doc|docx)$/)) return '📝'
  if (fileName.match(/\.(xls|xlsx)$/)) return '📊'
  if (isImage(null, fileName)) return '🖼️'
  return '📁'
}

function Row({ label, required, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
        {label}{required && <span style={{ color: '#dc2626' }}> *</span>}
      </label>
      {children}
    </div>
  )
}

const inputStyle = {
  padding: '8px 11px', borderRadius: 7, border: '1px solid #e2e8f0',
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
}

const selectStyle = {
  ...inputStyle, background: 'white',
}

const EMPTY_FORM = {
  employee_code: '', full_name: '',
  birthday: '', gender: '', marital_status: '',
  private_code: '', private_code_date: '', private_code_place: '',
  nationality: '', ethnicity: '',
  phone: '', mobile: '', email: '',
  home_address: '', current_address: '',
  department_id: '', position_id: '', job_title_id: '',
  job_status: 'OFFICIAL', job_date_join: '', job_date_try: '', job_reldate_join: '',
  job_date_out: '', job_out_reason: '',
  education_level: '', professional_level: '', training_school: '', work_history: '',
  tax_code: '', social_insurance_number: '', labor_contract_number: '',
  emergency_phone_1: '', emergency_phone_2: '',
  salary_method: '', salary_real: '',
  description: '', is_active: true,
}

function toFormValues(item) {
  if (!item) return { ...EMPTY_FORM }
  const dateStr = (v) => v ? v.substring(0, 10) : ''
  return {
    employee_code: item.employee_code || '',
    full_name: item.full_name || '',
    birthday: dateStr(item.birthday),
    gender: item.gender || '',
    marital_status: item.marital_status || '',
    private_code: item.private_code || '',
    private_code_date: dateStr(item.private_code_date),
    private_code_place: item.private_code_place || '',
    nationality: item.nationality || '',
    ethnicity: item.ethnicity || '',
    phone: item.phone || '',
    mobile: item.mobile || '',
    email: item.email || '',
    home_address: item.home_address || '',
    current_address: item.current_address || '',
    department_id: item.department_id || '',
    position_id: item.position_id || '',
    job_title_id: item.job_title_id || '',
    job_status: item.job_status || 'OFFICIAL',
    job_date_join: dateStr(item.job_date_join),
    job_date_try: dateStr(item.job_date_try),
    job_reldate_join: dateStr(item.job_reldate_join),
    job_date_out: dateStr(item.job_date_out),
    job_out_reason: item.job_out_reason || '',
    education_level: item.education_level || '',
    professional_level: item.professional_level || '',
    training_school: item.training_school || '',
    work_history: item.work_history || '',
    tax_code: item.tax_code || '',
    social_insurance_number: item.social_insurance_number || '',
    labor_contract_number: item.labor_contract_number || '',
    emergency_phone_1: item.emergency_phone_1 || '',
    emergency_phone_2: item.emergency_phone_2 || '',
    salary_method: item.salary_method || '',
    salary_real: item.salary_real != null ? String(item.salary_real) : '',
    description: item.description || '',
    is_active: item.is_active !== false,
  }
}

// Mini quick-add form cho vị trí / chức danh
function QuickAddPopover({ title, codePlaceholder, titlePlaceholder, onSave, onClose, saving }) {
  const [code,  setCode]  = useState('')
  const [label, setLabel] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  return (
    <div style={{
      position: 'absolute', zIndex: 300, top: '100%', left: 0, right: 0, marginTop: 4,
      background: 'white', border: '1px solid #bfdbfe', borderRadius: 8,
      boxShadow: '0 6px 20px rgba(0,0,0,0.12)', padding: 12,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#1a2744', marginBottom: 8 }}>➕ {title}</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input ref={ref} value={code} onChange={e => setCode(e.target.value)}
          placeholder={codePlaceholder} onKeyDown={e => e.key === 'Escape' && onClose()}
          style={{ flex: '0 0 90px', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }} />
        <input value={label} onChange={e => setLabel(e.target.value)}
          placeholder={titlePlaceholder} onKeyDown={e => e.key === 'Enter' && label.trim() && onSave(code, label)}
          style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }} />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => label.trim() && onSave(code, label)}
          disabled={saving || !label.trim()}
          style={{ flex: 1, padding: '6px 0', background: '#1a2744', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: !label.trim() ? 0.5 : 1 }}
        >{saving ? '...' : 'Lưu'}</button>
        <button onClick={onClose}
          style={{ padding: '6px 10px', background: '#f1f5f9', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
        >Huỷ</button>
      </div>
    </div>
  )
}

export default function PersonnelFormModal({ item, departments = [], onClose, onSaved }) {
  const isEdit = !!item
  const qc = useQueryClient()
  const [tab, setTab] = useState('personal')
  const [form, setForm] = useState(() => toFormValues(item))
  const [errors, setErrors] = useState({})
  const [showAddPosition, setShowAddPosition] = useState(false)
  const [showAddJobTitle, setShowAddJobTitle] = useState(false)
  // Sau khi tạo mới xong, lưu id để upload tài liệu
  const [savedId, setSavedId] = useState(item?.id || null)
  const [saved, setSaved] = useState(isEdit)
  // Upload state
  const [uploading, setUploading] = useState(false)
  const [uploadingType, setUploadingType] = useState(null)
  const [dragOverType, setDragOverType] = useState(null)
  const fileInputRef = useRef(null)
  const [uploadDocType, setUploadDocType] = useState('OTHER')

  useEffect(() => {
    setForm(toFormValues(item))
    setErrors({})
    setTab('personal')
    setSavedId(item?.id || null)
    setSaved(!!item)
  }, [item])

  const { data: positions = [] } = useQuery({
    queryKey: ['positions-list'],
    queryFn: () => personnelApi.listPositions().then(r => r.data),
  })

  const { data: jobTitles = [] } = useQuery({
    queryKey: ['job-titles-list'],
    queryFn: () => personnelApi.listJobTitles().then(r => r.data),
  })

  const addPositionMutation = useMutation({
    mutationFn: ({ code, title }) => personnelApi.createPosition({
      code: code || `POS_${Date.now()}`, title, is_active: true,
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['positions-list'] })
      setForm(f => ({ ...f, position_id: res.data.id }))
      setShowAddPosition(false)
    },
    onError: (err) => alert(err.response?.data?.detail || 'Không thể thêm vị trí'),
  })

  const addJobTitleMutation = useMutation({
    mutationFn: ({ code, title }) => personnelApi.createJobTitle({
      code: code || undefined, title, is_active: true,
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['job-titles-list'] })
      setForm(f => ({ ...f, job_title_id: res.data.id }))
      setShowAddJobTitle(false)
    },
    onError: (err) => alert(err.response?.data?.detail || 'Không thể thêm chức danh'),
  })

  // Documents
  const { data: documents = [], refetch: refetchDocs } = useQuery({
    queryKey: ['personnel-docs-modal', savedId],
    queryFn: () => personnelApi.listDocuments(savedId).then(r => r.data),
    enabled: !!savedId && tab === 'docs',
  })

  const deleteDocMutation = useMutation({
    mutationFn: (docId) => personnelApi.deleteDocument(docId),
    onSuccess: () => refetchDocs(),
  })

  const doUpload = async (file, docType) => {
    if (!file || !savedId) return
    setUploading(true)
    setUploadingType(docType)
    try {
      await personnelApi.uploadDocument(savedId, file, docType, '')
      refetchDocs()
    } catch (err) {
      alert(err.response?.data?.detail || 'Upload thất bại')
    } finally {
      setUploading(false)
      setUploadingType(null)
    }
  }

  const handleFileInput = async (e) => {
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

  const mutation = useMutation({
    mutationFn: (payload) => isEdit
      ? personnelApi.update(item.id, payload)
      : personnelApi.create(payload),
    onSuccess: (res) => {
      if (!isEdit) {
        // Thêm mới: lưu id, chuyển sang tab tài liệu
        setSavedId(res.data.id)
        setSaved(true)
        setTab('docs')
        qc.invalidateQueries({ queryKey: ['personnel'] })
      } else {
        onSaved()
      }
    },
    onError: (err) => {
      const detail = err.response?.data?.detail
      if (typeof detail === 'string') setErrors({ _global: detail })
      else setErrors({ _global: 'Có lỗi xảy ra. Vui lòng thử lại.' })
    },
  })

  const set = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm(f => ({ ...f, [field]: val }))
    if (errors[field]) setErrors(er => ({ ...er, [field]: '' }))
  }

  const validate = () => {
    const e = {}
    if (!form.employee_code.trim()) e.employee_code = 'Mã nhân viên là bắt buộc'
    if (!form.full_name.trim()) e.full_name = 'Họ tên là bắt buộc'
    return e
  }

  const handleSubmit = () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); setTab('personal'); return }

    const payload = { ...form }
    // convert empty strings to null for optional fields
    const nullableFields = [
      'birthday', 'gender', 'marital_status', 'private_code', 'private_code_date',
      'private_code_place', 'nationality', 'ethnicity', 'phone', 'mobile', 'email',
      'home_address', 'current_address', 'department_id', 'position_id', 'job_title_id',
      'job_date_join', 'job_date_try', 'job_reldate_join',
      'job_date_out', 'job_out_reason', 'salary_method', 'description',
      'education_level', 'professional_level', 'training_school', 'work_history',
      'tax_code', 'social_insurance_number', 'labor_contract_number',
      'emergency_phone_1', 'emergency_phone_2',
    ]
    nullableFields.forEach(f => { if (payload[f] === '') payload[f] = null })
    payload.salary_real = payload.salary_real !== '' ? Number(payload.salary_real) : null

    // Đồng bộ position text từ position_id để list hiện đúng
    if (payload.position_id) {
      const pos = positions.find(p => String(p.id) === String(payload.position_id))
      if (pos) payload.position = pos.title
    } else {
      payload.position = null
    }

    mutation.mutate(payload)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
    }}>
      <div style={{
        background: 'white', borderRadius: 14, width: 680, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#1a2744' }}>
              {isEdit ? '✏️ Chỉnh sửa nhân viên' : '➕ Thêm nhân viên mới'}
            </div>
            {isEdit && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{item.full_name}</div>}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8', padding: '0 4px' }}
          >×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', padding: '0 24px' }}>
          {FORM_TABS.map(t => {
            // Tab tài liệu chỉ hiện khi đã lưu được id
            if (t.key === 'docs' && !saved) return null
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: '10px 14px', fontSize: 12, fontWeight: tab === t.key ? 700 : 500,
                  color: tab === t.key ? '#1a2744' : '#64748b',
                  border: 'none', borderBottom: tab === t.key ? '2px solid #1a2744' : '2px solid transparent',
                  background: 'none', cursor: 'pointer',
                }}
              >
                {t.label}
                {t.key === 'docs' && documents.length > 0 && (
                  <span style={{ marginLeft: 5, background: '#e2e8f0', color: '#475569', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
                    {documents.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Error global */}
        {errors._global && (
          <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>
            {errors._global}
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* Tab: Cá nhân */}
          {tab === 'personal' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Row label="Mã nhân viên" required>
                <input
                  value={form.employee_code} onChange={set('employee_code')}
                  placeholder="VD: NV001"
                  style={{ ...inputStyle, borderColor: errors.employee_code ? '#dc2626' : '#e2e8f0' }}
                  disabled={isEdit}
                />
                {errors.employee_code && <span style={{ fontSize: 11, color: '#dc2626' }}>{errors.employee_code}</span>}
              </Row>
              <Row label="Họ và tên" required>
                <input
                  value={form.full_name} onChange={set('full_name')}
                  placeholder="Nguyễn Văn A"
                  style={{ ...inputStyle, borderColor: errors.full_name ? '#dc2626' : '#e2e8f0' }}
                />
                {errors.full_name && <span style={{ fontSize: 11, color: '#dc2626' }}>{errors.full_name}</span>}
              </Row>
              <Row label="Ngày sinh">
                <input type="date" value={form.birthday} onChange={set('birthday')} style={inputStyle} />
              </Row>
              <Row label="Giới tính">
                <select value={form.gender} onChange={set('gender')} style={selectStyle}>
                  {GENDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Row>
              <Row label="Tình trạng hôn nhân">
                <select value={form.marital_status} onChange={set('marital_status')} style={selectStyle}>
                  {MARITAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Row>
              <Row label="Quốc tịch">
                <input value={form.nationality} onChange={set('nationality')} placeholder="Việt Nam" style={inputStyle} />
              </Row>
              <Row label="Số CMND/CCCD">
                <input value={form.private_code} onChange={set('private_code')} placeholder="012345678901" style={inputStyle} />
              </Row>
              <Row label="Ngày cấp CMND/CCCD">
                <input type="date" value={form.private_code_date} onChange={set('private_code_date')} style={inputStyle} />
              </Row>
              <div style={{ gridColumn: '1 / -1' }}>
                <Row label="Nơi cấp CMND/CCCD">
                  <input value={form.private_code_place} onChange={set('private_code_place')} placeholder="Công an tỉnh/thành..." style={inputStyle} />
                </Row>
              </div>
              <Row label="Dân tộc">
                <input value={form.ethnicity} onChange={set('ethnicity')} placeholder="Kinh" style={inputStyle} />
              </Row>
              <Row label="Trạng thái tài khoản">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.is_active} onChange={set('is_active')} />
                  <span style={{ color: form.is_active ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                    {form.is_active ? '✓ Đang hoạt động' : '✗ Đã vô hiệu hóa'}
                  </span>
                </label>
              </Row>

              {/* Học vấn */}
              <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #f1f5f9', paddingTop: 12, marginTop: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Học vấn & Chuyên môn</div>
              </div>
              <Row label="Trình độ văn hóa">
                <input value={form.education_level} onChange={set('education_level')} placeholder="VD: 12/12, Đại học..." style={inputStyle} />
              </Row>
              <Row label="Trình độ chuyên môn">
                <input value={form.professional_level} onChange={set('professional_level')} placeholder="VD: Kỹ sư xây dựng..." style={inputStyle} />
              </Row>
              <div style={{ gridColumn: '1 / -1' }}>
                <Row label="Trường đào tạo">
                  <input value={form.training_school} onChange={set('training_school')} placeholder="Tên trường..." style={inputStyle} />
                </Row>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <Row label="Quá trình học tập và công tác">
                  <textarea value={form.work_history} onChange={set('work_history')} rows={3}
                    placeholder="Mô tả quá trình học tập, công tác qua các đơn vị..."
                    style={{ ...inputStyle, resize: 'vertical' }} />
                </Row>
              </div>

              {/* Bảo hiểm & Thuế */}
              <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #f1f5f9', paddingTop: 12, marginTop: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Bảo hiểm & Thuế</div>
              </div>
              <Row label="MST cá nhân">
                <input value={form.tax_code} onChange={set('tax_code')} placeholder="Mã số thuế cá nhân" style={inputStyle} />
              </Row>
              <Row label="Số sổ BHXH">
                <input value={form.social_insurance_number} onChange={set('social_insurance_number')} placeholder="Số sổ BHXH" style={inputStyle} />
              </Row>
              <div style={{ gridColumn: '1 / -1' }}>
                <Row label="Số hợp đồng lao động">
                  <input value={form.labor_contract_number} onChange={set('labor_contract_number')} placeholder="Số HĐLĐ hiện hành" style={inputStyle} />
                </Row>
              </div>
            </div>
          )}

          {/* Tab: Liên hệ */}
          {tab === 'contact' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Row label="Số điện thoại cố định">
                <input value={form.phone} onChange={set('phone')} placeholder="024..." style={inputStyle} />
              </Row>
              <Row label="Số di động">
                <input value={form.mobile} onChange={set('mobile')} placeholder="09x..." style={inputStyle} />
              </Row>
              <div style={{ gridColumn: '1 / -1' }}>
                <Row label="Email">
                  <input type="email" value={form.email} onChange={set('email')} placeholder="example@company.com" style={inputStyle} />
                </Row>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <Row label="Địa chỉ thường trú">
                  <textarea
                    value={form.home_address} onChange={set('home_address')}
                    rows={2} placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành..."
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </Row>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <Row label="Địa chỉ hiện tại">
                  <textarea
                    value={form.current_address} onChange={set('current_address')}
                    rows={2} placeholder="Nếu khác địa chỉ thường trú..."
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </Row>
              </div>
              <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #f1f5f9', paddingTop: 12, marginTop: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Liên hệ khẩn cấp</div>
              </div>
              <Row label="SĐT người thân (1)">
                <input value={form.emergency_phone_1} onChange={set('emergency_phone_1')} placeholder="09x..." style={inputStyle} />
              </Row>
              <Row label="SĐT người thân (2)">
                <input value={form.emergency_phone_2} onChange={set('emergency_phone_2')} placeholder="09x..." style={inputStyle} />
              </Row>
            </div>
          )}

          {/* Tab: Công việc */}
          {tab === 'job' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Row label="Phòng ban">
                <select value={form.department_id} onChange={set('department_id')} style={selectStyle}>
                  <option value="">-- Chọn phòng ban --</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Row>
              <Row label="Vị trí công việc">
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select value={form.position_id} onChange={set('position_id')} style={{ ...selectStyle, flex: 1 }}>
                      <option value="">-- Chọn vị trí --</option>
                      {positions.filter(p => p.is_active).map(p => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                    </select>
                    <button type="button"
                      onClick={() => { setShowAddPosition(v => !v); setShowAddJobTitle(false) }}
                      title="Thêm vị trí mới"
                      style={{ padding: '0 10px', background: showAddPosition ? '#1a2744' : '#f1f5f9', color: showAddPosition ? 'white' : '#1a2744', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
                      +
                    </button>
                  </div>
                  {showAddPosition && (
                    <QuickAddPopover
                      title="Thêm vị trí công việc"
                      codePlaceholder="Mã (VD: KT)"
                      titlePlaceholder="Tên vị trí *"
                      saving={addPositionMutation.isPending}
                      onSave={(code, title) => addPositionMutation.mutate({ code, title })}
                      onClose={() => setShowAddPosition(false)}
                    />
                  )}
                </div>
              </Row>
              <Row label="Chức danh">
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select value={form.job_title_id} onChange={set('job_title_id')} style={{ ...selectStyle, flex: 1 }}>
                      <option value="">-- Chọn chức danh --</option>
                      {jobTitles.filter(t => t.is_active).map(t => (
                        <option key={t.id} value={t.id}>{t.title}</option>
                      ))}
                    </select>
                    <button type="button"
                      onClick={() => { setShowAddJobTitle(v => !v); setShowAddPosition(false) }}
                      title="Thêm chức danh mới"
                      style={{ padding: '0 10px', background: showAddJobTitle ? '#1a2744' : '#f1f5f9', color: showAddJobTitle ? 'white' : '#1a2744', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
                      +
                    </button>
                  </div>
                  {showAddJobTitle && (
                    <QuickAddPopover
                      title="Thêm chức danh"
                      codePlaceholder="Mã (tuỳ chọn)"
                      titlePlaceholder="Tên chức danh *"
                      saving={addJobTitleMutation.isPending}
                      onSave={(code, title) => addJobTitleMutation.mutate({ code, title })}
                      onClose={() => setShowAddJobTitle(false)}
                    />
                  )}
                </div>
              </Row>
              <Row label="Trạng thái lao động">
                <select value={form.job_status} onChange={set('job_status')} style={selectStyle}>
                  {JOB_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Row>
              <Row label="Ngày vào làm">
                <input type="date" value={form.job_date_join} onChange={set('job_date_join')} style={inputStyle} />
              </Row>
              <Row label="Ngày bắt đầu thử việc">
                <input type="date" value={form.job_date_try} onChange={set('job_date_try')} style={inputStyle} />
              </Row>
              <Row label="Ngày chính thức">
                <input type="date" value={form.job_reldate_join} onChange={set('job_reldate_join')} style={inputStyle} />
              </Row>
              <Row label="Ngày nghỉ việc">
                <input type="date" value={form.job_date_out} onChange={set('job_date_out')} style={inputStyle} />
              </Row>
              <div style={{ gridColumn: '1 / -1' }}>
                <Row label="Lý do nghỉ việc">
                  <textarea
                    value={form.job_out_reason} onChange={set('job_out_reason')}
                    rows={2} style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </Row>
              </div>
            </div>
          )}

          {/* Tab: Lương & Mô tả */}
          {tab === 'salary' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Row label="Hình thức lương">
                <select value={form.salary_method} onChange={set('salary_method')} style={selectStyle}>
                  {SALARY_METHOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Row>
              <Row label="Mức lương thực nhận (VNĐ)">
                <input
                  type="number" min="0" step="100000"
                  value={form.salary_real} onChange={set('salary_real')}
                  placeholder="VD: 10000000"
                  style={inputStyle}
                />
              </Row>
              <div style={{ gridColumn: '1 / -1' }}>
                <Row label="Ghi chú / Mô tả">
                  <textarea
                    value={form.description} onChange={set('description')}
                    rows={4} style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </Row>
              </div>
            </div>
          )}

          {/* Tab: Tài liệu hồ sơ */}
          {tab === 'docs' && (
            <div>
              {/* Banner thêm mới vừa xong */}
              {!isEdit && saved && (
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#15803d', display: 'flex', alignItems: 'center', gap: 8 }}>
                  ✅ Đã tạo nhân viên thành công! Bạn có thể đính kèm tài liệu ngay bên dưới.
                </div>
              )}

              <input ref={fileInputRef} type="file" onChange={handleFileInput} style={{ display: 'none' }}
                accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx" />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {DOC_TYPES.map(dt => {
                  const group = documents.filter(d => d.doc_type === dt.value)
                  const isDragging = dragOverType === dt.value
                  const isUploadingThis = uploadingType === dt.value

                  return (
                    <div key={dt.value} style={{
                      border: `1px solid ${isDragging ? dt.color : '#e2e8f0'}`,
                      borderRadius: 8, overflow: 'hidden',
                      background: isDragging ? dt.bg : 'white',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                      onDragOver={e => { e.preventDefault(); setDragOverType(dt.value) }}
                      onDragLeave={() => setDragOverType(null)}
                      onDrop={e => handleDrop(e, dt.value)}
                    >
                      {/* Header row */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                        background: group.length > 0 ? dt.bg : '#fafafa',
                        borderBottom: group.length > 0 ? `1px solid ${dt.color}22` : 'none',
                      }}>
                        <span>{dt.icon}</span>
                        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: '#1a2744' }}>{dt.label}</span>
                        {group.length > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: dt.color, background: 'white', border: `1px solid ${dt.color}44`, padding: '1px 6px', borderRadius: 8 }}>
                            {group.length}
                          </span>
                        )}
                        <button
                          onClick={() => { setUploadDocType(dt.value); fileInputRef.current?.click() }}
                          disabled={uploading}
                          style={{
                            padding: '4px 10px', fontSize: 11, fontWeight: 700,
                            background: isUploadingThis ? '#e2e8f0' : dt.color,
                            color: 'white', border: 'none', borderRadius: 5,
                            cursor: uploading ? 'not-allowed' : 'pointer',
                            opacity: uploading && !isUploadingThis ? 0.5 : 1,
                          }}
                        >{isUploadingThis ? '⏳' : '⬆️'} Upload</button>
                      </div>

                      {/* Files */}
                      {group.map((doc, i) => (
                        <div key={doc.id} style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                          borderBottom: i < group.length - 1 ? '1px solid #f1f5f9' : 'none',
                          background: i % 2 === 0 ? 'white' : '#fafafa',
                        }}>
                          <span style={{ fontSize: 16, flexShrink: 0 }}>{fileIcon(doc.file_name)}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#1a2744', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.file_name}>
                              {doc.file_name}
                            </div>
                            <div style={{ fontSize: 10, color: '#94a3b8' }}>{humanSize(doc.file_size_bytes)}</div>
                          </div>
                          <a href={`${API_BASE}${doc.file_url}`} target="_blank" rel="noreferrer" download={doc.file_name}
                            style={{ fontSize: 11, color: '#2563eb', textDecoration: 'none', padding: '3px 8px', border: '1px solid #bfdbfe', borderRadius: 5, flexShrink: 0 }}>
                            ⬇️
                          </a>
                          <button
                            onClick={() => { if (window.confirm(`Xóa "${doc.file_name}"?`)) deleteDocMutation.mutate(doc.id) }}
                            style={{ fontSize: 11, color: '#dc2626', background: '#fef2f2', border: 'none', borderRadius: 5, cursor: 'pointer', padding: '3px 7px', flexShrink: 0 }}
                          >🗑️</button>
                        </div>
                      ))}

                      {/* Empty hint */}
                      {group.length === 0 && (
                        <div style={{ padding: '6px 12px', fontSize: 11, color: '#94a3b8' }}>
                          {isDragging ? '📂 Thả file vào đây...' : 'Kéo thả hoặc nhấn Upload'}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px', borderTop: '1px solid #f1f5f9',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button
            onClick={onClose}
            style={{ padding: '9px 18px', background: '#f1f5f9', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13 }}
          >{tab === 'docs' && !isEdit ? 'Hoàn tất' : 'Huỷ'}</button>
          {(tab !== 'docs' || isEdit) && <button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            style={{
              padding: '9px 22px', background: '#1a2744', color: 'white',
              border: 'none', borderRadius: 7, cursor: mutation.isPending ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 700, opacity: mutation.isPending ? 0.7 : 1,
            }}
          >{mutation.isPending ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Thêm nhân viên'}</button>}
        </div>
      </div>
    </div>
  )
}
