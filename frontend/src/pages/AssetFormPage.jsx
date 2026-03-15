import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { assetApi, deptApi, locationApi, supplierApi, assetTypeGroupApi } from '../services/api'
import { Card, PageHeader, Btn, Spinner } from '../components/ui'

const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001/api/v1'
const IMG_HOST = BASE.replace('/api/v1', '')

const STATUS_OPTIONS = [
  { value: 'PENDING_ALLOCATION', label: 'Chờ cấp phát' },
  { value: 'IN_USE',             label: 'Đang sử dụng' },
  { value: 'IN_MAINTENANCE',     label: 'Đang bảo trì' },
  { value: 'RECOVERED',          label: 'Đã thu hồi' },
  { value: 'LIQUIDATED',         label: 'Thanh lý' },
  { value: 'LOST',               label: 'Mất' },
  { value: 'CANCELLED',          label: 'Đã huỷ' },
  { value: 'BROKEN',             label: 'Hỏng' },
]

const EMPTY = {
  asset_code: '', name: '', barcode: '', status: 'PENDING_ALLOCATION',
  asset_type_id: '', managing_department_id: '', current_location_id: '',
  supplier_id: '', model_series: '', year_manufactured: '', country_manufactured: '',
  purchase_price: '', original_value: '', depreciation_months: '', loan_amount: '',
  purchase_date: '', warranty_end_date: '', expiry_date: '', warranty_months: '',
  chassis_number: '', engine_number: '', registration_expiry: '',
  quantity: 1, description: '', condition_description: '', tags: '',
}

function Field({ label, required, children, hint }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

const inp = {
  width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1',
  fontSize: 13, boxSizing: 'border-box', outline: 'none',
}
const sel = { ...inp, background: 'white', cursor: 'pointer' }

function Section({ title, children }) {
  return (
    <Card style={{ marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#1a2744', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
        {title}
      </h3>
      <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
        {children}
      </div>
    </Card>
  )
}

function ErrMsg({ msg }) {
  return msg ? <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>{msg}</div> : null
}

const addBtn = {
  padding: '7px 10px', borderRadius: 7, border: '1px solid #10b981',
  background: '#f0fdf4', color: '#10b981', cursor: 'pointer',
  fontSize: 18, fontWeight: 700, lineHeight: 1, flexShrink: 0,
}

function QuickAdd({ onSave, onClose, saving, placeholder }) {
  const [val, setVal] = useState('')
  return (
    <div style={{ marginTop: 5, display: 'flex', gap: 5 }}>
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && val.trim()) onSave(val.trim())
          if (e.key === 'Escape') onClose()
        }}
        placeholder={placeholder || 'Nhập tên mới...'}
        autoFocus
        style={{ ...inp, flex: 1 }}
      />
      <button onClick={() => val.trim() && onSave(val.trim())} disabled={saving || !val.trim()}
        style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: '#10b981', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 700, opacity: (saving || !val.trim()) ? 0.6 : 1 }}>
        {saving ? '…' : '✓ Lưu'}
      </button>
      <button onClick={onClose}
        style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', fontSize: 12 }}>
        ✕
      </button>
    </div>
  )
}

export default function AssetFormPage() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()
  const qc = useQueryClient()
  const imgRef = useRef()

  const [form, setForm] = useState(EMPTY)
  const [groupId, setGroupId] = useState('')
  const [dynAttrs, setDynAttrs] = useState({})   // dynamic_attributes values
  const [errors, setErrors] = useState({})
  const [imgPreview, setImgPreview] = useState(null)
  const [imgFile, setImgFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [showAdd, setShowAdd] = useState('')
  const [addSaving, setAddSaving] = useState(false)

  // Reference data
  const { data: groups = [] } = useQuery({ queryKey: ['asset-type-groups'], queryFn: () => assetTypeGroupApi.list().then(r => r.data) })
  const { data: types = [] } = useQuery({ queryKey: ['asset-types-in-group', groupId], queryFn: () => assetTypeGroupApi.listTypes(groupId).then(r => r.data), enabled: !!groupId })

  // Current group's attribute definitions (dynamic attributes)
  const currentGroup = groups.find(g => String(g.id) === String(groupId))
  const groupAttributes = currentGroup?.attributes || []
  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: () => deptApi.list().then(r => r.data) })
  const { data: locations = [] } = useQuery({ queryKey: ['locations'], queryFn: () => locationApi.list().then(r => r.data) })
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => supplierApi.list().then(r => r.data) })

  // Load existing asset for edit
  const { data: asset, isLoading } = useQuery({
    queryKey: ['asset', id],
    queryFn: () => assetApi.getById(id).then(r => r.data),
    enabled: isEdit,
  })

  useEffect(() => {
    if (!asset) return
    const toStr = v => v == null ? '' : String(v)
    setForm({
      asset_code: toStr(asset.asset_code),
      name: toStr(asset.name),
      barcode: toStr(asset.barcode),
      status: asset.status || 'PENDING_ALLOCATION',
      asset_type_id: toStr(asset.asset_type_id),
      managing_department_id: toStr(asset.managing_department_id),
      current_location_id: toStr(asset.current_location_id),
      supplier_id: toStr(asset.supplier_id),
      model_series: toStr(asset.model_series),
      year_manufactured: toStr(asset.year_manufactured),
      country_manufactured: toStr(asset.country_manufactured),
      purchase_price: toStr(asset.purchase_price),
      original_value: toStr(asset.original_value),
      depreciation_months: toStr(asset.depreciation_months),
      loan_amount: toStr(asset.loan_amount),
      purchase_date: toStr(asset.purchase_date),
      warranty_end_date: toStr(asset.warranty_end_date),
      expiry_date: toStr(asset.expiry_date),
      warranty_months: toStr(asset.warranty_months),
      chassis_number: toStr(asset.chassis_number),
      engine_number: toStr(asset.engine_number),
      registration_expiry: toStr(asset.registration_expiry),
      quantity: asset.quantity ?? 1,
      description: toStr(asset.description),
      condition_description: toStr(asset.condition_description),
      tags: Array.isArray(asset.tags) ? asset.tags.join(', ') : toStr(asset.tags),
    })
    if (asset.asset_type_id) {
      // find group for this type
      setGroupId('') // will reload when groups load
    }
    if (asset.asset_image_url) {
      setImgPreview(`${IMG_HOST}${asset.asset_image_url}`)
    }
    if (asset.dynamic_attributes && typeof asset.dynamic_attributes === 'object') {
      setDynAttrs(asset.dynamic_attributes)
    }
  }, [asset])

  // When asset loads with an asset_type_id, look up its group via flat-types
  useEffect(() => {
    if (!asset?.asset_type_id) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await assetTypeGroupApi.listFlatTypes()
        if (!cancelled) {
          const found = res.data.find(t => String(t.id) === String(asset.asset_type_id))
          if (found) setGroupId(String(found.group_id))
        }
      } catch {}
    })()
    return () => { cancelled = true }
  }, [asset?.asset_type_id])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const validate = () => {
    const e = {}
    if (!form.asset_code.trim()) e.asset_code = 'Bắt buộc'
    if (!form.name.trim()) e.name = 'Bắt buộc'
    if (!isEdit && !form.asset_type_id) e.asset_type_id = 'Bắt buộc'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const buildPayload = () => {
    const p = {}
    // int fields must always send a number (not null) — default 0
    const intFields = ['depreciation_months', 'warranty_months', 'quantity']
    const numFields = ['purchase_price', 'original_value', 'loan_amount']
    const dateFields = ['purchase_date', 'warranty_end_date', 'expiry_date', 'registration_expiry']
    const uuidFields = ['asset_type_id', 'managing_department_id', 'current_location_id', 'supplier_id']
    const strFields = ['asset_code', 'name', 'barcode', 'status', 'model_series', 'year_manufactured',
      'country_manufactured', 'chassis_number', 'engine_number', 'description', 'condition_description']

    strFields.forEach(k => { if (form[k] !== '') p[k] = form[k] || null })
    numFields.forEach(k => { if (form[k] !== '') p[k] = Number(form[k]) || null })
    intFields.forEach(k => { p[k] = form[k] !== '' ? (parseInt(form[k]) || 0) : 0 })
    dateFields.forEach(k => { if (form[k]) p[k] = form[k]; else p[k] = null })
    uuidFields.forEach(k => { if (form[k]) p[k] = form[k]; else p[k] = null })

    const tagsRaw = form.tags.trim()
    p.tags = tagsRaw ? tagsRaw.split(/[,;]+/).map(t => t.trim()).filter(Boolean) : null

    p.dynamic_attributes = dynAttrs || {}

    return p
  }

  const createMutation = useMutation({
    mutationFn: (data) => assetApi.create(data),
    onSuccess: async (res) => {
      const newId = res.data.id
      if (imgFile) await doUploadImage(newId)
      qc.invalidateQueries(['assets'])
      navigate(`/assets/${newId}`)
    },
    onError: (e) => alert('Lỗi: ' + (e.response?.data?.detail || e.message)),
  })

  const updateMutation = useMutation({
    mutationFn: (data) => assetApi.update(id, data),
    onSuccess: async () => {
      if (imgFile) await doUploadImage(id)
      qc.invalidateQueries(['assets'])
      qc.invalidateQueries(['asset', id])
      navigate(`/assets/${id}`)
    },
    onError: (e) => alert('Lỗi: ' + (e.response?.data?.detail || e.message)),
  })

  const doUploadImage = async (assetId) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', imgFile)
      await assetApi.uploadImage(assetId, fd)
    } catch (e) {
      console.warn('Image upload failed', e)
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = () => {
    if (!validate()) return
    const payload = buildPayload()
    if (isEdit) updateMutation.mutate(payload)
    else createMutation.mutate(payload)
  }

  const handleImgChange = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setImgFile(f)
    setImgPreview(URL.createObjectURL(f))
  }

  if (isEdit && isLoading) return <Spinner />

  const saving = createMutation.isPending || updateMutation.isPending || uploading

  return (
    <div>
      <PageHeader
        title={isEdit ? `✏️ Chỉnh sửa: ${asset?.asset_code || ''}` : '➕ Thêm tài sản mới'}
        subtitle={isEdit ? asset?.name : 'Điền thông tin tài sản bên dưới'}
        actions={
          <>
            <Btn variant="outline" onClick={() => navigate(isEdit ? `/assets/${id}` : '/assets')}>← Huỷ</Btn>
            <Btn variant="primary" onClick={handleSubmit} disabled={saving}>
              {saving ? '⏳ Đang lưu...' : (isEdit ? '💾 Lưu thay đổi' : '➕ Tạo tài sản')}
            </Btn>
          </>
        }
      />

      <div style={{ padding: 24, maxWidth: 1000 }}>

        {/* Image upload */}
        <Card style={{ marginBottom: 16, padding: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#1a2744' }}>📷 Ảnh tài sản</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              onClick={() => imgRef.current.click()}
              style={{
                width: 120, height: 120, borderRadius: 10, border: '2px dashed #cbd5e1',
                overflow: 'hidden', cursor: 'pointer', background: '#f8fafc',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}
            >
              {imgPreview
                ? <img src={imgPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 36, color: '#cbd5e1' }}>📷</span>
              }
            </div>
            <div>
              <Btn variant="outline" size="sm" onClick={() => imgRef.current.click()}>
                {imgPreview ? '🔄 Đổi ảnh' : '📤 Chọn ảnh'}
              </Btn>
              {imgPreview && (
                <Btn variant="ghost" size="sm" style={{ marginLeft: 8 }} onClick={() => { setImgPreview(null); setImgFile(null) }}>
                  🗑️ Xoá
                </Btn>
              )}
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>JPG, PNG — tối đa 5MB</div>
              {imgFile && !isEdit && (
                <div style={{ fontSize: 11, color: '#10b981', marginTop: 4 }}>Ảnh sẽ được tải lên sau khi tạo tài sản</div>
              )}
            </div>
            <input ref={imgRef} type="file" accept="image/*" onChange={handleImgChange} style={{ display: 'none' }} />
          </div>
        </Card>

        {/* Basic info */}
        <Section title="📋 Thông tin cơ bản">
          <div>
            <Field label="Mã tài sản" required>
              <input value={form.asset_code} onChange={e => set('asset_code', e.target.value)}
                style={{ ...inp, borderColor: errors.asset_code ? '#ef4444' : '#cbd5e1' }}
                placeholder="VD: MRN1, XE001..." disabled={isEdit} />
              <ErrMsg msg={errors.asset_code} />
            </Field>
          </div>
          <div>
            <Field label="Tên tài sản" required>
              <input value={form.name} onChange={e => set('name', e.target.value)}
                style={{ ...inp, borderColor: errors.name ? '#ef4444' : '#cbd5e1' }}
                placeholder="Tên đầy đủ của tài sản" />
              <ErrMsg msg={errors.name} />
            </Field>
          </div>
          <div>
            <Field label="Nhóm loại tài sản" required={!isEdit}>
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={groupId} onChange={e => { setGroupId(e.target.value); set('asset_type_id', ''); setDynAttrs({}) }} style={{ ...sel, flex: 1 }}>
                  <option value="">-- Chọn nhóm --</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <button title="Thêm nhóm mới" onClick={() => setShowAdd(showAdd === 'group' ? '' : 'group')} style={addBtn}>+</button>
              </div>
              {showAdd === 'group' && (
                <QuickAdd placeholder="Tên nhóm loại tài sản..." saving={addSaving}
                  onSave={async (name) => {
                    setAddSaving(true)
                    try {
                      const res = await assetTypeGroupApi.create({ name })
                      qc.invalidateQueries(['asset-type-groups'])
                      setGroupId(String(res.data.id))
                      set('asset_type_id', '')
                      setShowAdd('')
                    } catch (e) { alert(e.response?.data?.detail || e.message) }
                    finally { setAddSaving(false) }
                  }}
                  onClose={() => setShowAdd('')}
                />
              )}
            </Field>
          </div>
          <div>
            <Field label="Loại tài sản cụ thể" required={!isEdit}>
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={form.asset_type_id} onChange={e => set('asset_type_id', e.target.value)}
                  style={{ ...sel, flex: 1, borderColor: errors.asset_type_id ? '#ef4444' : '#cbd5e1' }}
                  disabled={!groupId}>
                  <option value="">-- Chọn loại --</option>
                  {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button title="Thêm loại mới" onClick={() => setShowAdd(showAdd === 'type' ? '' : 'type')}
                  disabled={!groupId} style={{ ...addBtn, opacity: groupId ? 1 : 0.4, cursor: groupId ? 'pointer' : 'not-allowed' }}>+</button>
              </div>
              <ErrMsg msg={errors.asset_type_id} />
              {showAdd === 'type' && (
                <QuickAdd placeholder="Tên loại tài sản..." saving={addSaving}
                  onSave={async (name) => {
                    setAddSaving(true)
                    try {
                      const res = await assetTypeGroupApi.createType(groupId, { name })
                      qc.invalidateQueries(['asset-types-in-group', groupId])
                      set('asset_type_id', String(res.data.id))
                      setShowAdd('')
                    } catch (e) { alert(e.response?.data?.detail || e.message) }
                    finally { setAddSaving(false) }
                  }}
                  onClose={() => setShowAdd('')}
                />
              )}
            </Field>
          </div>
          <div>
            <Field label="Barcode" hint="Nhấn ⚡ để tự tạo">
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={form.barcode} onChange={e => set('barcode', e.target.value)} style={{ ...inp, flex: 1 }} placeholder="Mã vạch (tuỳ chọn)" />
                <button title="Tự tạo barcode" onClick={() => set('barcode', 'BC' + Date.now().toString(36).toUpperCase())} style={addBtn}>⚡</button>
              </div>
            </Field>
          </div>
          <div>
            <Field label="Trạng thái">
              <select value={form.status} onChange={e => set('status', e.target.value)} style={sel}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          </div>
          <div>
            <Field label="Phòng ban quản lý">
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={form.managing_department_id} onChange={e => set('managing_department_id', e.target.value)} style={{ ...sel, flex: 1 }}>
                  <option value="">-- Chọn phòng ban --</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button title="Thêm phòng ban mới" onClick={() => setShowAdd(showAdd === 'dept' ? '' : 'dept')} style={addBtn}>+</button>
              </div>
              {showAdd === 'dept' && (
                <QuickAdd placeholder="Tên phòng ban..." saving={addSaving}
                  onSave={async (name) => {
                    setAddSaving(true)
                    try {
                      const res = await deptApi.create({ name })
                      qc.invalidateQueries(['departments'])
                      set('managing_department_id', String(res.data.id))
                      setShowAdd('')
                    } catch (e) { alert(e.response?.data?.detail || e.message) }
                    finally { setAddSaving(false) }
                  }}
                  onClose={() => setShowAdd('')}
                />
              )}
            </Field>
          </div>
          <div>
            <Field label="Vị trí hiện tại">
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={form.current_location_id} onChange={e => set('current_location_id', e.target.value)} style={{ ...sel, flex: 1 }}>
                  <option value="">-- Chọn vị trí --</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <button title="Thêm vị trí mới" onClick={() => setShowAdd(showAdd === 'loc' ? '' : 'loc')} style={addBtn}>+</button>
              </div>
              {showAdd === 'loc' && (
                <QuickAdd placeholder="Tên vị trí..." saving={addSaving}
                  onSave={async (name) => {
                    setAddSaving(true)
                    try {
                      const res = await locationApi.create({ name })
                      qc.invalidateQueries(['locations'])
                      set('current_location_id', String(res.data.id))
                      setShowAdd('')
                    } catch (e) { alert(e.response?.data?.detail || e.message) }
                    finally { setAddSaving(false) }
                  }}
                  onClose={() => setShowAdd('')}
                />
              )}
            </Field>
          </div>
          <div>
            <Field label="Nhà cung cấp">
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)} style={{ ...sel, flex: 1 }}>
                  <option value="">-- Chọn NCC --</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button title="Thêm nhà cung cấp mới" onClick={() => setShowAdd(showAdd === 'supplier' ? '' : 'supplier')} style={addBtn}>+</button>
              </div>
              {showAdd === 'supplier' && (
                <QuickAdd placeholder="Tên nhà cung cấp..." saving={addSaving}
                  onSave={async (name) => {
                    setAddSaving(true)
                    try {
                      const res = await supplierApi.create({ name })
                      qc.invalidateQueries(['suppliers'])
                      set('supplier_id', String(res.data.id))
                      setShowAdd('')
                    } catch (e) { alert(e.response?.data?.detail || e.message) }
                    finally { setAddSaving(false) }
                  }}
                  onClose={() => setShowAdd('')}
                />
              )}
            </Field>
          </div>
          <div>
            <Field label="Số lượng">
              <input type="number" min={1} value={form.quantity} onChange={e => set('quantity', e.target.value)} style={inp} />
            </Field>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Model / Series">
              <input value={form.model_series} onChange={e => set('model_series', e.target.value)} style={inp} placeholder="VD: Komatsu D65EX-18..." />
            </Field>
          </div>
          <div>
            <Field label="Năm sản xuất">
              <input value={form.year_manufactured} onChange={e => set('year_manufactured', e.target.value)} style={inp} placeholder="VD: 2020" />
            </Field>
          </div>
          <div>
            <Field label="Nước sản xuất">
              <input value={form.country_manufactured} onChange={e => set('country_manufactured', e.target.value)} style={inp} placeholder="VD: Nhật Bản" />
            </Field>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Mô tả">
              <textarea value={form.description} onChange={e => set('description', e.target.value)}
                style={{ ...inp, height: 70, resize: 'vertical' }} placeholder="Mô tả chung về tài sản" />
            </Field>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Tình trạng thực tế">
              <textarea value={form.condition_description} onChange={e => set('condition_description', e.target.value)}
                style={{ ...inp, height: 60, resize: 'vertical' }} placeholder="Diễn giải tình trạng hiện tại" />
            </Field>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Tags" hint="Phân cách bằng dấu phẩy. VD: ưu tiên, cần bảo trì">
              <input value={form.tags} onChange={e => set('tags', e.target.value)} style={inp} placeholder="tag1, tag2, tag3..." />
            </Field>
          </div>
        </Section>

        {/* Financial */}
        <Section title="💰 Thông tin tài chính">
          <div>
            <Field label="Giá mua (₫)">
              <input type="number" value={form.purchase_price} onChange={e => set('purchase_price', e.target.value)} style={inp} placeholder="0" />
            </Field>
          </div>
          <div>
            <Field label="Nguyên giá (₫)">
              <input type="number" value={form.original_value} onChange={e => set('original_value', e.target.value)} style={inp} placeholder="0" />
            </Field>
          </div>
          <div>
            <Field label="Khấu hao (tháng)">
              <input type="number" min={0} value={form.depreciation_months} onChange={e => set('depreciation_months', e.target.value)} style={inp} placeholder="0" />
            </Field>
          </div>
          <div>
            <Field label="Dư nợ vay (₫)">
              <input type="number" value={form.loan_amount} onChange={e => set('loan_amount', e.target.value)} style={inp} placeholder="0" />
            </Field>
          </div>
          <div>
            <Field label="Ngày mua">
              <input type="date" value={form.purchase_date} onChange={e => set('purchase_date', e.target.value)} style={inp} />
            </Field>
          </div>
          <div>
            <Field label="Ngày hết hạn">
              <input type="date" value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)} style={inp} />
            </Field>
          </div>
          <div>
            <Field label="Ngày kết thúc bảo hành">
              <input type="date" value={form.warranty_end_date} onChange={e => set('warranty_end_date', e.target.value)} style={inp} />
            </Field>
          </div>
          <div>
            <Field label="Thời gian BH (tháng)">
              <input type="number" min={0} value={form.warranty_months} onChange={e => set('warranty_months', e.target.value)} style={inp} placeholder="0" />
            </Field>
          </div>
        </Section>

        {/* Vehicle */}
        <Section title="🚗 Xe / Máy (tuỳ chọn)">
          <div>
            <Field label="Số khung">
              <input value={form.chassis_number} onChange={e => set('chassis_number', e.target.value)} style={inp} />
            </Field>
          </div>
          <div>
            <Field label="Số động cơ">
              <input value={form.engine_number} onChange={e => set('engine_number', e.target.value)} style={inp} />
            </Field>
          </div>
          <div>
            <Field label="Hạn đăng kiểm">
              <input type="date" value={form.registration_expiry} onChange={e => set('registration_expiry', e.target.value)} style={inp} />
            </Field>
          </div>
        </Section>

        {/* Dynamic Attributes — rendered from ConfigPage group settings */}
        {groupAttributes.length > 0 && (
          <Card style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#1a2744', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
              ⚙️ Thuộc tính đặc trưng nhóm ({currentGroup?.name})
            </h3>
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
              {groupAttributes.map(attr => (
                <div key={attr.field_key}>
                  <Field
                    label={`${attr.field_label}${attr.field_unit ? ` (${attr.field_unit})` : ''}`}
                    required={attr.is_required}
                  >
                    {attr.field_type === 'SELECT' && Array.isArray(attr.select_options) ? (
                      <select
                        value={dynAttrs[attr.field_key] ?? ''}
                        onChange={e => setDynAttrs(prev => ({ ...prev, [attr.field_key]: e.target.value }))}
                        style={sel}
                      >
                        <option value="">-- Chọn --</option>
                        {attr.select_options.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : attr.field_type === 'DATE' ? (
                      <input
                        type="date"
                        value={dynAttrs[attr.field_key] ?? ''}
                        onChange={e => setDynAttrs(prev => ({ ...prev, [attr.field_key]: e.target.value }))}
                        style={inp}
                      />
                    ) : attr.field_type === 'NUMBER' ? (
                      <input
                        type="number"
                        value={dynAttrs[attr.field_key] ?? ''}
                        onChange={e => setDynAttrs(prev => ({ ...prev, [attr.field_key]: e.target.value === '' ? '' : Number(e.target.value) }))}
                        style={inp}
                        placeholder="0"
                      />
                    ) : (
                      <input
                        type="text"
                        value={dynAttrs[attr.field_key] ?? ''}
                        onChange={e => setDynAttrs(prev => ({ ...prev, [attr.field_key]: e.target.value }))}
                        style={inp}
                        placeholder={attr.field_label}
                      />
                    )}
                  </Field>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Action bar bottom */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingBottom: 32 }}>
          <Btn variant="outline" onClick={() => navigate(isEdit ? `/assets/${id}` : '/assets')}>← Huỷ</Btn>
          <Btn variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? '⏳ Đang lưu...' : (isEdit ? '💾 Lưu thay đổi' : '➕ Tạo tài sản')}
          </Btn>
        </div>
      </div>
    </div>
  )
}
