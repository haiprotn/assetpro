import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { userApi, assetTypeGroupApi } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { Card, PageHeader, Btn, Spinner } from '../components/ui'
import toast from 'react-hot-toast'

// ── Constants ─────────────────────────────────────────────────────────
const ROLE_INFO = {
  SUPER_ADMIN: { label: 'Quản trị hệ thống', color: '#6d28d9', bg: '#f5f3ff', icon: '🛡️', desc: 'Toàn quyền cao nhất, quản lý hệ thống' },
  ADMIN:       { label: 'Quản trị viên',     color: '#7c3aed', bg: '#ede9fe', icon: '👑', desc: 'Toàn quyền, quản lý tài khoản' },
  MANAGER:     { label: 'Quản lý',           color: '#1d4ed8', bg: '#dbeafe', icon: '🏢', desc: 'Phê duyệt điều chuyển, xem báo cáo' },
  OPERATOR:    { label: 'Vận hành',          color: '#0891b2', bg: '#e0f2fe', icon: '⚙️', desc: 'Vận hành xuất kho, bảo trì tài sản' },
  VIEWER:      { label: 'Xem',               color: '#64748b', bg: '#f1f5f9', icon: '👁️', desc: 'Chỉ xem dữ liệu, không chỉnh sửa' },
}

// Default permissions per role per module
const ROLE_DEFAULTS = {
  SUPER_ADMIN: { 'Tổng quan': ['xem'], 'Tài sản': ['xem','tạo','sửa','xóa'], 'Điều chuyển': ['xem','tạo','duyệt','từ chối','hủy'], 'Bảo trì': ['xem','tạo','hoàn tất','hủy'], 'Lịch sử': ['xem'], 'Báo cáo': ['xem','xuất file'], 'Cấu hình': ['toàn quyền'], 'Tài khoản': ['toàn quyền'] },
  ADMIN:       { 'Tổng quan': ['xem'], 'Tài sản': ['xem','tạo','sửa','xóa'], 'Điều chuyển': ['xem','tạo','duyệt','từ chối','hủy'], 'Bảo trì': ['xem','tạo','hoàn tất','hủy'], 'Lịch sử': ['xem'], 'Báo cáo': ['xem','xuất file'], 'Cấu hình': ['toàn quyền'], 'Tài khoản': ['toàn quyền'] },
  MANAGER:     { 'Tổng quan': ['xem'], 'Tài sản': ['xem','tạo','sửa'], 'Điều chuyển': ['xem','tạo','duyệt','từ chối'], 'Bảo trì': ['xem','tạo','hoàn tất'], 'Lịch sử': ['xem'], 'Báo cáo': ['xem','xuất file'], 'Cấu hình': [], 'Tài khoản': [] },
  OPERATOR:    { 'Tổng quan': ['xem'], 'Tài sản': ['xem','sửa'], 'Điều chuyển': ['xem','tạo'], 'Bảo trì': ['xem','tạo','hoàn tất'], 'Lịch sử': ['xem'], 'Báo cáo': [], 'Cấu hình': [], 'Tài khoản': [] },
  VIEWER:      { 'Tổng quan': ['xem'], 'Tài sản': ['xem'], 'Điều chuyển': ['xem'], 'Bảo trì': ['xem'], 'Lịch sử': [], 'Báo cáo': [], 'Cấu hình': [], 'Tài khoản': [] },
}

const ALL_MODULES = ['Tổng quan', 'Tài sản', 'Điều chuyển', 'Bảo trì', 'Lịch sử', 'Báo cáo', 'Cấu hình', 'Tài khoản']

const MODULE_ACTIONS = {
  'Tổng quan':   ['xem'],
  'Tài sản':     ['xem', 'tạo', 'sửa', 'xóa'],
  'Điều chuyển': ['xem', 'tạo', 'duyệt', 'từ chối', 'hủy'],
  'Bảo trì':     ['xem', 'tạo', 'hoàn tất', 'hủy'],
  'Lịch sử':     ['xem'],
  'Báo cáo':     ['xem', 'xuất file'],
  'Cấu hình':    ['toàn quyền'],
  'Tài khoản':   ['toàn quyền'],
}

// Merge role defaults with user-level overrides
function effectivePermissions(role, customPerms) {
  if (!customPerms || Object.keys(customPerms).length === 0) return ROLE_DEFAULTS[role] || {}
  return { ...ROLE_DEFAULTS[role], ...customPerms }
}

const FIELD_TYPES = [
  { value: 'TEXT',    label: 'Văn bản',       color: '#475569', bg: '#f1f5f9' },
  { value: 'NUMBER',  label: 'Số',            color: '#1d4ed8', bg: '#dbeafe' },
  { value: 'DATE',    label: 'Ngày',          color: '#15803d', bg: '#dcfce7' },
  { value: 'SELECT',  label: 'Danh sách',     color: '#7c3aed', bg: '#ede9fe' },
  { value: 'BOOLEAN', label: 'Có/Không',      color: '#d97706', bg: '#fef3c7' },
  { value: 'IMAGE',   label: 'Hình ảnh/Tài liệu', color: '#0e7490', bg: '#e0f2fe' },
]
const FIELD_TYPE_MAP = Object.fromEntries(FIELD_TYPES.map(f => [f.value, f]))

// ── Shared UI ─────────────────────────────────────────────────────────
const inputSt = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
}
const labelSt = { fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }

function ModalWrap({ onClose, children, width = 460 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 16, padding: 28, width, boxShadow: '0 25px 70px rgba(0,0,0,0.35)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function RoleBadge({ role }) {
  const info = ROLE_INFO[role] || { label: role, color: '#64748b', bg: '#f1f5f9' }
  return <span style={{ background: info.bg, color: info.color, padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{info.icon} {info.label}</span>
}

// ── User Create/Edit Modal ────────────────────────────────────────────
function UserModal({ user, onClose, onSaved }) {
  const isEdit = !!user?.id
  const [form, setForm] = useState({
    username: user?.username || '',
    email: user?.email && !user.email.endsWith('@local') ? user.email : '',
    role: user?.role || 'OPERATOR',
    password: '',
    is_active: user?.is_active !== undefined ? user.is_active : true,
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.username) { toast.error('Vui lòng nhập tên đăng nhập'); return }
    if (!isEdit && !form.password) { toast.error('Vui lòng nhập mật khẩu'); return }
    if (form.password && form.password.length < 6) { toast.error('Mật khẩu phải ít nhất 6 ký tự'); return }
    setSaving(true)
    try {
      const payload = { ...form }
      if (!payload.password) delete payload.password
      if (isEdit) { await userApi.update(user.id, payload); toast.success('Đã cập nhật tài khoản') }
      else { await userApi.create(payload); toast.success('Đã tạo tài khoản mới') }
      onSaved()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Lỗi lưu tài khoản')
    } finally { setSaving(false) }
  }

  return (
    <ModalWrap onClose={onClose}>
      <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800 }}>
        {isEdit ? 'Chỉnh sửa tài khoản' : '+ Tạo tài khoản mới'}
      </h3>
      <p style={{ margin: '0 0 18px', fontSize: 12, color: '#94a3b8' }}>
        {isEdit ? `Tài khoản: ${user.username}` : 'Điền thông tin để tạo tài khoản đăng nhập hệ thống'}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelSt}>Tên đăng nhập *</label>
            <input style={{ ...inputSt, background: isEdit ? '#f8fafc' : 'white' }}
              value={form.username} onChange={e => set('username', e.target.value)}
              disabled={isEdit} placeholder="vd: nguyen.van.a" />
          </div>
          <div>
            <label style={labelSt}>Email</label>
            <input style={inputSt} type="email" value={form.email}
              onChange={e => set('email', e.target.value)} placeholder="email@company.com" />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelSt}>Vai trò *</label>
            <select style={inputSt} value={form.role} onChange={e => set('role', e.target.value)}>
              {Object.entries(ROLE_INFO).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>{ROLE_INFO[form.role]?.desc}</div>
          </div>
          <div>
            <label style={labelSt}>Trạng thái</label>
            <select style={inputSt} value={form.is_active ? '1' : '0'} onChange={e => set('is_active', e.target.value === '1')}>
              <option value="1">✅ Hoạt động</option>
              <option value="0">🚫 Vô hiệu hóa</option>
            </select>
          </div>
        </div>
        <div>
          <label style={labelSt}>{isEdit ? 'Mật khẩu mới (bỏ trống nếu không đổi)' : 'Mật khẩu *'}</label>
          <input style={inputSt} type="password" value={form.password}
            onChange={e => set('password', e.target.value)} placeholder="Tối thiểu 6 ký tự" />
        </div>
        {/* Role permission preview */}
        <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px', fontSize: 11 }}>
          <div style={{ fontWeight: 700, color: '#475569', marginBottom: 6 }}>Quyền mặc định theo vai trò:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {ALL_MODULES.map(mod => {
              const acts = (ROLE_DEFAULTS[form.role] || {})[mod] || []
              if (!acts.length) return null
              return (
                <span key={mod} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 6, padding: '2px 8px', color: '#374151' }}>
                  <strong>{mod}:</strong> {acts.join(', ')}
                </span>
              )
            })}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
        <Btn variant="ghost" onClick={onClose}>Hủy</Btn>
        <Btn variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo tài khoản'}</Btn>
      </div>
    </ModalWrap>
  )
}

// ── Custom Permission Editor Modal ────────────────────────────────────
function PermissionModal({ user, onClose, onSaved }) {
  const role = user.role
  const roleDefaults = ROLE_DEFAULTS[role] || {}
  // Start from user's existing custom perms or empty
  const [custom, setCustom] = useState(
    user.permissions && Object.keys(user.permissions).length > 0 ? { ...user.permissions } : {}
  )
  const [saving, setSaving] = useState(false)
  const [useCustom, setUseCustom] = useState(
    user.permissions && Object.keys(user.permissions).length > 0
  )

  const toggle = (mod, action) => {
    setCustom(prev => {
      const cur = prev[mod] !== undefined ? [...prev[mod]] : [...(roleDefaults[mod] || [])]
      const idx = cur.indexOf(action)
      if (idx >= 0) cur.splice(idx, 1)
      else cur.push(action)
      return { ...prev, [mod]: cur }
    })
  }

  const resetModule = (mod) => {
    setCustom(prev => {
      const next = { ...prev }
      delete next[mod]
      return next
    })
  }

  const isOverridden = (mod) => custom[mod] !== undefined
  const getActions = (mod) => custom[mod] !== undefined ? custom[mod] : (roleDefaults[mod] || [])
  const hasAction = (mod, action) => getActions(mod).includes(action)

  const handleSave = async () => {
    setSaving(true)
    try {
      const perms = useCustom ? custom : {}
      await userApi.update(user.id, { permissions: perms })
      toast.success('Đã lưu phân quyền tùy chỉnh')
      onSaved()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Lỗi lưu quyền')
    } finally { setSaving(false) }
  }

  const info = ROLE_INFO[role] || {}

  return (
    <ModalWrap onClose={onClose} width={620}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800 }}>Tùy chỉnh quyền — {user.username}</h3>
          <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
            Vai trò gốc: <RoleBadge role={role} /> · Ghi đè quyền cụ thể theo từng module
          </p>
        </div>
      </div>

      {/* Toggle custom mode */}
      <div style={{
        background: useCustom ? '#fef3c7' : '#f0fdf4', border: `1px solid ${useCustom ? '#fde68a' : '#bbf7d0'}`,
        borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          <input type="checkbox" checked={useCustom} onChange={e => setUseCustom(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }} />
          {useCustom ? 'Đang dùng quyền tùy chỉnh' : 'Sử dụng quyền mặc định theo vai trò'}
        </label>
        {useCustom && (
          <span style={{ fontSize: 11, color: '#d97706' }}>
            Các module được đánh dấu vàng đang ghi đè quyền vai trò
          </span>
        )}
      </div>

      {/* Permission grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: useCustom ? 1 : 0.5, pointerEvents: useCustom ? 'auto' : 'none' }}>
        {ALL_MODULES.map(mod => {
          const allActions = MODULE_ACTIONS[mod] || []
          const overridden = isOverridden(mod)
          return (
            <div key={mod} style={{
              border: `1.5px solid ${overridden ? '#fde68a' : '#e2e8f0'}`,
              borderRadius: 10, padding: '10px 14px',
              background: overridden ? '#fffbeb' : 'white',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{mod}</span>
                {overridden && (
                  <span style={{ fontSize: 10, background: '#fde68a', color: '#92400e', padding: '1px 8px', borderRadius: 10, fontWeight: 700 }}>Tùy chỉnh</span>
                )}
                {overridden && (
                  <button onClick={() => resetModule(mod)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#94a3b8', padding: '2px 6px' }}>
                    Đặt lại mặc định
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {allActions.map(action => {
                  const checked = hasAction(mod, action)
                  const isDefault = (roleDefaults[mod] || []).includes(action)
                  return (
                    <label key={action} style={{
                      display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                      padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                      background: checked ? info.bg : '#f8fafc',
                      color: checked ? info.color : '#94a3b8',
                      border: `1.5px solid ${checked ? info.color + '40' : '#e2e8f0'}`,
                      transition: 'all 0.15s',
                    }}>
                      <input type="checkbox" checked={checked}
                        onChange={() => { if (!overridden) setCustom(p => ({ ...p, [mod]: [...(roleDefaults[mod] || [])] })); toggle(mod, action) }}
                        style={{ display: 'none' }} />
                      {checked ? '✓' : '○'} {action}
                      {isDefault && !overridden && <span style={{ fontSize: 9, color: '#94a3b8' }}>  (mặc định)</span>}
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
        <Btn variant="ghost" onClick={onClose}>Hủy</Btn>
        <Btn variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu phân quyền'}</Btn>
      </div>
    </ModalWrap>
  )
}

// ── Reset Password Modal ──────────────────────────────────────────────
function ResetPasswordModal({ user, onClose }) {
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const handleReset = async () => {
    if (!pw || pw.length < 6) { toast.error('Mật khẩu phải ít nhất 6 ký tự'); return }
    if (pw !== confirm) { toast.error('Mật khẩu xác nhận không khớp'); return }
    setSaving(true)
    try {
      await userApi.resetPassword(user.id, pw)
      toast.success('Đã đặt lại mật khẩu thành công')
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Lỗi đặt lại mật khẩu')
    } finally { setSaving(false) }
  }
  return (
    <ModalWrap onClose={onClose} width={380}>
      <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800 }}>Đặt lại mật khẩu</h3>
      <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>Tài khoản: <strong>{user.username}</strong></p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label style={labelSt}>Mật khẩu mới *</label>
          <input type="password" style={inputSt} value={pw} onChange={e => setPw(e.target.value)} placeholder="Tối thiểu 6 ký tự" />
        </div>
        <div>
          <label style={labelSt}>Xác nhận mật khẩu *</label>
          <input type="password" style={{ ...inputSt, borderColor: confirm && confirm !== pw ? '#fca5a5' : '#e2e8f0' }}
            value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Nhập lại mật khẩu" />
          {confirm && confirm !== pw && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3 }}>Mật khẩu không khớp</div>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <Btn variant="ghost" onClick={onClose}>Hủy</Btn>
        <Btn variant="primary" onClick={handleReset} disabled={saving}>{saving ? 'Đang lưu...' : 'Xác nhận'}</Btn>
      </div>
    </ModalWrap>
  )
}

// ── Tab: Quản lý tài khoản ────────────────────────────────────────────
function TabUsers() {
  const qc = useQueryClient()
  const { user: currentUser } = useAuthStore()
  const [modal, setModal] = useState(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => userApi.list().then(r => r.data),
  })
  const users = Array.isArray(data) ? data : []

  const filtered = users.filter(u => {
    const matchRole = !roleFilter || u.role === roleFilter
    const q = search.toLowerCase()
    return (!q || u.username.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.personnel_name || '').toLowerCase().includes(q)) && matchRole
  })

  const toggleActive = useMutation({
    mutationFn: u => userApi.update(u.id, { is_active: !u.is_active }),
    onSuccess: () => { qc.invalidateQueries(['users-list']); toast.success('Đã cập nhật trạng thái') },
    onError: err => toast.error(err?.response?.data?.detail || 'Lỗi cập nhật'),
  })

  const onSaved = () => { qc.invalidateQueries(['users-list']); setModal(null) }

  const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(currentUser?.role)
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'

  const deleteUser = useMutation({
    mutationFn: u => userApi.delete(u.id),
    onSuccess: () => { qc.invalidateQueries(['users-list']); toast.success('Đã xóa tài khoản') },
    onError: err => toast.error(err?.response?.data?.detail || 'Lỗi xóa tài khoản'),
  })

  const handleDelete = (u) => {
    if (!window.confirm(`Xóa tài khoản "${u.username}"? Hành động này không thể hoàn tác.`)) return
    deleteUser.mutate(u)
  }

  return (
    <div>
      {/* Prominent create button banner (admin only) */}
      {isAdmin && (
        <div style={{
          background: 'linear-gradient(135deg, #1a2744, #2d4a8a)',
          borderRadius: 14, padding: '16px 20px', marginBottom: 18,
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'white', fontWeight: 800, fontSize: 14 }}>Thêm tài khoản mới</div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 }}>
              Tạo tài khoản đăng nhập cho nhân viên, phân vai trò và quyền truy cập
            </div>
          </div>
          <button onClick={() => setModal({ type: 'create' })} style={{
            background: '#f59e0b', color: 'white', border: 'none', borderRadius: 10,
            padding: '10px 20px', fontSize: 14, fontWeight: 800, cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(245,158,11,0.4)', whiteSpace: 'nowrap',
          }}>+ Tạo tài khoản</button>
        </div>
      )}

      {/* Stats + Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <input placeholder="Tìm tên đăng nhập / email..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...inputSt, width: 230 }} />

        {/* Role filter pills */}
        <div style={{ display: 'flex', gap: 6 }}>
          <span
            onClick={() => setRoleFilter('')}
            style={{
              borderRadius: 20, padding: '5px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: !roleFilter ? '#1a2744' : '#f1f5f9',
              color: !roleFilter ? 'white' : '#64748b',
            }}>Tất cả ({users.length})</span>
          {Object.entries(ROLE_INFO).map(([role, info]) => {
            const count = users.filter(u => u.role === role).length
            if (!count) return null
            return (
              <span key={role} onClick={() => setRoleFilter(roleFilter === role ? '' : role)} style={{
                borderRadius: 20, padding: '5px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: roleFilter === role ? info.color : info.bg,
                color: roleFilter === role ? 'white' : info.color,
                border: `2px solid ${roleFilter === role ? info.color : 'transparent'}`,
              }}>{info.icon} {info.label} ({count})</span>
            )
          })}
        </div>
      </div>

      {/* Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                {['Tài khoản', 'Liên hệ', 'Vai trò & Quyền', 'Trạng thái', 'Đăng nhập cuối', ''].map((h, i) => (
                  <th key={i} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: '#64748b' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>
                  {isAdmin ? (
                    <div>
                      <div style={{ marginBottom: 8 }}>Chưa có tài khoản phù hợp</div>
                      <button onClick={() => setModal({ type: 'create' })} style={{
                        background: '#1a2744', color: 'white', border: 'none', borderRadius: 8,
                        padding: '8px 18px', fontSize: 13, cursor: 'pointer', fontWeight: 600,
                      }}>+ Tạo tài khoản đầu tiên</button>
                    </div>
                  ) : 'Không có tài khoản phù hợp'}
                </td></tr>
              )}
              {filtered.map(u => {
                const hasCustomPerms = u.permissions && Object.keys(u.permissions).length > 0
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9', background: u.is_active ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {u.username}
                        {u.id === currentUser?.id && (
                          <span style={{ fontSize: 10, color: '#3b82f6', background: '#dbeafe', borderRadius: 10, padding: '1px 6px' }}>Bạn</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{u.personnel_name || '—'}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{u.email && !u.email.endsWith('@local') ? u.email : ''}</div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <RoleBadge role={u.role} />
                        {hasCustomPerms && (
                          <span style={{ fontSize: 10, background: '#fef3c7', color: '#d97706', padding: '1px 7px', borderRadius: 10, fontWeight: 700 }}>
                            Tùy chỉnh
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        background: u.is_active ? '#dcfce7' : '#fef2f2',
                        color: u.is_active ? '#16a34a' : '#dc2626',
                        padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                      }}>{u.is_active ? 'Hoạt động' : 'Vô hiệu'}</span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: '#94a3b8' }}>
                      {u.last_login ? new Date(u.last_login).toLocaleDateString('vi-VN') : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {isAdmin && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <Btn size="sm" variant="ghost" onClick={() => setModal({ type: 'edit', user: u })}>Sửa</Btn>
                          <Btn size="sm" variant="ghost" onClick={() => setModal({ type: 'perms', user: u })}
                            style={{ color: '#d97706', borderColor: '#fde68a' }}>Phân quyền</Btn>
                          <Btn size="sm" variant="ghost" onClick={() => setModal({ type: 'reset', user: u })}>Đặt lại MK</Btn>
                          {u.id !== currentUser?.id && (
                            <Btn size="sm" variant="ghost"
                              style={{ color: u.is_active ? '#dc2626' : '#16a34a' }}
                              onClick={() => toggleActive.mutate(u)}>
                              {u.is_active ? 'Vô hiệu' : 'Kích hoạt'}
                            </Btn>
                          )}
                          {isSuperAdmin && u.id !== currentUser?.id && u.role !== 'SUPER_ADMIN' && (
                            <Btn size="sm" variant="ghost"
                              style={{ color: '#dc2626', borderColor: '#fecaca' }}
                              onClick={() => handleDelete(u)}>
                              Xóa
                            </Btn>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      {modal?.type === 'create' && <UserModal onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.type === 'edit'   && <UserModal user={modal.user} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.type === 'perms'  && <PermissionModal user={modal.user} onClose={() => setModal(null)} onSaved={onSaved} />}
      {modal?.type === 'reset'  && <ResetPasswordModal user={modal.user} onClose={() => setModal(null)} />}
    </div>
  )
}

// ── Tab: Phân quyền ───────────────────────────────────────────────────
function TabPermissions() {
  const [selectedRole, setSelectedRole] = useState('SUPER_ADMIN')
  const { data } = useQuery({ queryKey: ['users-list'], queryFn: () => userApi.list().then(r => r.data) })
  const users = Array.isArray(data) ? data : []
  const [selectedUser, setSelectedUser] = useState(null)
  const [modal, setModal] = useState(null)
  const qc = useQueryClient()
  const { user: currentUser } = useAuthStore()
  const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(currentUser?.role)

  const roleUsers = users.filter(u => u.role === selectedRole)
  const info = ROLE_INFO[selectedRole]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20 }}>
      {/* Left: Role list */}
      <div>
        <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>Chọn vai trò</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(ROLE_INFO).map(([role, ri]) => {
            const count = users.filter(u => u.role === role).length
            return (
              <div key={role} onClick={() => { setSelectedRole(role); setSelectedUser(null) }} style={{
                borderRadius: 12, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s',
                border: `2px solid ${selectedRole === role ? ri.color : '#f1f5f9'}`,
                background: selectedRole === role ? ri.bg : 'white',
                boxShadow: selectedRole === role ? `0 4px 14px ${ri.color}25` : 'none',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 22 }}>{ri.icon}</span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 13, color: ri.color }}>{ri.label}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>{ri.desc}</div>
                    </div>
                  </div>
                  <span style={{ background: ri.bg, color: ri.color, borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 800, border: `1px solid ${ri.color}40` }}>
                    {count}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Right: Permissions for selected role */}
      <div>
        {/* Default permissions */}
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>Quyền mặc định — {info.icon} {info.label}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{info.desc}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ALL_MODULES.map(mod => {
              const acts = (ROLE_DEFAULTS[selectedRole] || {})[mod] || []
              return (
                <div key={mod} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 8,
                  background: acts.length > 0 ? '#f8fafc' : 'transparent',
                }}>
                  <span style={{ fontWeight: 600, fontSize: 13, width: 120, color: acts.length ? '#374151' : '#cbd5e1' }}>{mod}</span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {acts.length === 0
                      ? <span style={{ fontSize: 11, color: '#e2e8f0' }}>Không có quyền</span>
                      : acts.map(a => (
                        <span key={a} style={{ background: info.bg, color: info.color, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{a}</span>
                      ))
                    }
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Users with this role */}
        <Card>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 12 }}>
            Tài khoản với vai trò {info.label} ({roleUsers.length})
          </div>
          {roleUsers.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>Không có tài khoản nào</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {roleUsers.map(u => {
                const hasCustom = u.permissions && Object.keys(u.permissions).length > 0
                const eff = effectivePermissions(u.role, u.permissions)
                return (
                  <div key={u.id} style={{
                    border: `1.5px solid ${selectedUser === u.id ? info.color : '#e2e8f0'}`,
                    borderRadius: 10, padding: '10px 14px',
                    background: selectedUser === u.id ? info.bg : 'white',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }} onClick={() => setSelectedUser(selectedUser === u.id ? null : u.id)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{u.username}</span>
                        {u.personnel_name && <span style={{ fontSize: 11, color: '#94a3b8' }}>({u.personnel_name})</span>}
                        {hasCustom && (
                          <span style={{ fontSize: 10, background: '#fef3c7', color: '#d97706', padding: '1px 7px', borderRadius: 10, fontWeight: 700 }}>
                            Tùy chỉnh
                          </span>
                        )}
                      </div>
                      {isAdmin && (
                        <Btn size="sm" variant="ghost"
                          style={{ color: '#d97706', fontSize: 11 }}
                          onClick={e => { e.stopPropagation(); setModal({ type: 'perms', user: u }) }}>
                          Chỉnh quyền
                        </Btn>
                      )}
                    </div>

                    {/* Expanded: show effective permissions */}
                    {selectedUser === u.id && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>
                          Quyền hiện hành {hasCustom ? '(có ghi đè tùy chỉnh)' : '(theo vai trò)'}:
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {ALL_MODULES.map(mod => {
                            const acts = eff[mod] || []
                            const isOverride = hasCustom && u.permissions[mod] !== undefined
                            if (!acts.length) return null
                            return (
                              <div key={mod} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <span style={{ fontSize: 11, color: '#64748b', width: 90 }}>{mod}:</span>
                                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                                  {acts.map(a => (
                                    <span key={a} style={{
                                      background: isOverride ? '#fef3c7' : info.bg,
                                      color: isOverride ? '#d97706' : info.color,
                                      padding: '1px 7px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                                    }}>{a}</span>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {modal?.type === 'perms' && (
        <PermissionModal user={modal.user} onClose={() => setModal(null)}
          onSaved={() => { qc.invalidateQueries(['users-list']); setModal(null) }} />
      )}
    </div>
  )
}

// ── System Config Modals ───────────────────────────────────────────────

function GroupModal({ group, onClose, onSaved }) {
  const isEdit = !!group?.id
  const [form, setForm] = useState({
    name: group?.name || '',
    code: group?.code || '',
    allocation_type: group?.allocation_type || 'RECOVERABLE',
    tracking_unit: group?.tracking_unit || 'Cái',
    icon: group?.icon || '',
    color: group?.color || '#3b82f6',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Vui lòng nhập tên nhóm'); return }
    setSaving(true)
    try {
      if (isEdit) { await assetTypeGroupApi.update(group.id, form); toast.success('Đã cập nhật nhóm') }
      else { await assetTypeGroupApi.create(form); toast.success('Đã tạo nhóm mới') }
      onSaved()
    } catch (err) { toast.error(err?.response?.data?.detail || 'Lỗi lưu nhóm') }
    finally { setSaving(false) }
  }

  return (
    <ModalWrap onClose={onClose}>
      <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 800 }}>{isEdit ? 'Chỉnh sửa nhóm' : 'Thêm nhóm tài sản mới'}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><label style={labelSt}>Tên nhóm *</label>
          <input style={inputSt} value={form.name} onChange={e => set('name', e.target.value)} placeholder="vd: Xe cơ giới, Thiết bị đo đạc..." /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={labelSt}>Mã nhóm {isEdit && '(không thể đổi)'}</label>
            <input style={{ ...inputSt, background: isEdit ? '#f8fafc' : 'white' }}
              value={form.code} onChange={e => set('code', e.target.value.toUpperCase())}
              disabled={isEdit} placeholder="Tự sinh nếu để trống" /></div>
          <div><label style={labelSt}>Đơn vị tính</label>
            <input style={inputSt} value={form.tracking_unit} onChange={e => set('tracking_unit', e.target.value)} placeholder="Cái, Bộ, Chiếc..." /></div>
        </div>
        <div><label style={labelSt}>Loại phân bổ</label>
          <select style={inputSt} value={form.allocation_type} onChange={e => set('allocation_type', e.target.value)}>
            <option value="RECOVERABLE">Có thu hồi — tài sản có thể thu hồi lại</option>
            <option value="CONSUMABLE">Tiêu hao — không thu hồi sau sử dụng</option>
          </select></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 12 }}>
          <div><label style={labelSt}>Biểu tượng (emoji)</label>
            <input style={inputSt} value={form.icon} onChange={e => set('icon', e.target.value)} placeholder="🚗 🔧 📐 ..." /></div>
          <div><label style={labelSt}>Màu</label>
            <input type="color" style={{ ...inputSt, padding: 4, height: 38, cursor: 'pointer' }}
              value={form.color} onChange={e => set('color', e.target.value)} /></div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
        <Btn variant="ghost" onClick={onClose}>Hủy</Btn>
        <Btn variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</Btn>
      </div>
    </ModalWrap>
  )
}

function TypeModal({ group, onClose }) {
  const qc = useQueryClient()
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const { data: types = [], isLoading } = useQuery({
    queryKey: ['group-types', group.id],
    queryFn: () => assetTypeGroupApi.listTypes(group.id).then(r => r.data),
  })
  const handleAdd = async () => {
    if (!newName.trim()) return
    setSaving(true)
    try {
      await assetTypeGroupApi.createType(group.id, { name: newName.trim() })
      toast.success('Đã thêm loại tài sản')
      qc.invalidateQueries(['group-types', group.id])
      qc.invalidateQueries(['asset-types-config'])
      setNewName('')
    } catch (err) { toast.error(err?.response?.data?.detail || 'Lỗi thêm loại') }
    finally { setSaving(false) }
  }
  const handleDelete = async (t) => {
    if (t.asset_count > 0) { toast.error(`Loại đang có ${t.asset_count} tài sản, không thể xóa`); return }
    if (!window.confirm(`Xóa loại "${t.name}"?`)) return
    try {
      await assetTypeGroupApi.deleteType(group.id, t.id)
      qc.invalidateQueries(['group-types', group.id])
      qc.invalidateQueries(['asset-types-config'])
      toast.success('Đã xóa')
    } catch (err) { toast.error(err?.response?.data?.detail || 'Lỗi xóa') }
  }
  return (
    <ModalWrap onClose={onClose} width={440}>
      <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800 }}>Loại tài sản — {group.name}</h3>
      <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 14px' }}>Các loại cụ thể thuộc nhóm này</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input style={{ ...inputSt, flex: 1 }} value={newName} onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()} placeholder="Tên loại tài sản mới..." />
        <Btn variant="primary" onClick={handleAdd} disabled={saving || !newName.trim()}>+ Thêm</Btn>
      </div>
      {isLoading ? <Spinner /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
          {types.length === 0 && <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: '16px 0' }}>Chưa có loại tài sản nào</p>}
          {types.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f8fafc', borderRadius: 8 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{t.name}</span>
                <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 8 }}>#{t.code}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {t.asset_count > 0 && <span style={{ fontSize: 11, color: '#64748b' }}>{t.asset_count} TS</span>}
                <button onClick={() => handleDelete(t)} style={{
                  background: 'none', border: 'none', color: '#ef4444', cursor: t.asset_count > 0 ? 'not-allowed' : 'pointer',
                  fontSize: 14, padding: '2px 6px', opacity: t.asset_count > 0 ? 0.4 : 1,
                }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <Btn variant="ghost" onClick={onClose}>Đóng</Btn>
      </div>
    </ModalWrap>
  )
}

function AttributeModal({ group, attr, onClose, onSaved }) {
  const isEdit = !!attr?.id
  const [form, setForm] = useState({
    field_label: attr?.field_label || '',
    field_key: attr?.field_key || '',
    field_type: attr?.field_type || 'TEXT',
    field_unit: attr?.field_unit || '',
    is_required: attr?.is_required || false,
    is_searchable: attr?.is_searchable || false,
    display_order: attr?.display_order || 0,
    select_options: attr?.select_options || [],
  })
  const [saving, setSaving] = useState(false)
  const [optInput, setOptInput] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.field_label.trim()) { toast.error('Vui lòng nhập nhãn thuộc tính'); return }
    setSaving(true)
    try {
      if (isEdit) { await assetTypeGroupApi.updateAttribute(group.id, attr.id, form); toast.success('Đã cập nhật thuộc tính') }
      else { await assetTypeGroupApi.createAttribute(group.id, form); toast.success('Đã thêm thuộc tính') }
      onSaved()
    } catch (err) { toast.error(err?.response?.data?.detail || 'Lỗi lưu thuộc tính') }
    finally { setSaving(false) }
  }

  return (
    <ModalWrap onClose={onClose} width={480}>
      <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800 }}>{isEdit ? 'Chỉnh sửa thuộc tính' : 'Thêm thuộc tính động'}</h3>
      <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>Nhóm: {group.name}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div><label style={labelSt}>Nhãn hiển thị *</label>
            <input style={inputSt} value={form.field_label} onChange={e => set('field_label', e.target.value)} placeholder="vd: Số km, Ngày đăng kiểm..." /></div>
          <div><label style={labelSt}>Kiểu dữ liệu *</label>
            <select style={inputSt} value={form.field_type} onChange={e => set('field_type', e.target.value)}>
              {FIELD_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
            </select></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 70px', gap: 12 }}>
          <div><label style={labelSt}>Khóa (field_key)</label>
            <input style={inputSt} value={form.field_key} onChange={e => set('field_key', e.target.value)} placeholder="Tự sinh từ nhãn" /></div>
          <div><label style={labelSt}>Đơn vị</label>
            <input style={inputSt} value={form.field_unit} onChange={e => set('field_unit', e.target.value)} placeholder="km, ngày..." /></div>
          <div><label style={labelSt}>Thứ tự</label>
            <input style={inputSt} type="number" value={form.display_order} onChange={e => set('display_order', +e.target.value)} /></div>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.is_required} onChange={e => set('is_required', e.target.checked)} /> Bắt buộc nhập
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.is_searchable} onChange={e => set('is_searchable', e.target.checked)} /> Cho phép tìm kiếm
          </label>
        </div>
        {form.field_type === 'SELECT' && (
          <div>
            <label style={labelSt}>Các lựa chọn</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input style={{ ...inputSt, flex: 1 }} value={optInput} onChange={e => setOptInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && optInput.trim()) { set('select_options', [...(form.select_options || []), optInput.trim()]); setOptInput('') } }}
                placeholder="Nhập lựa chọn rồi nhấn Enter..." />
              <Btn variant="ghost" onClick={() => { if (optInput.trim()) { set('select_options', [...(form.select_options || []), optInput.trim()]); setOptInput('') } }}>+ Thêm</Btn>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(form.select_options || []).map((opt, i) => (
                <span key={i} style={{ background: '#ede9fe', color: '#7c3aed', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {opt}
                  <button onClick={() => set('select_options', form.select_options.filter((_, idx) => idx !== i))}
                    style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
                </span>
              ))}
              {!(form.select_options || []).length && <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Chưa có lựa chọn</span>}
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
        <Btn variant="ghost" onClick={onClose}>Hủy</Btn>
        <Btn variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</Btn>
      </div>
    </ModalWrap>
  )
}

// ── Tab: Cấu hình hệ thống ────────────────────────────────────────────
function TabSystem() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(null)
  const { data, isLoading } = useQuery({
    queryKey: ['asset-types-config'],
    queryFn: () => assetTypeGroupApi.list().then(r => r.data),
  })
  const groups = Array.isArray(data) ? data : []

  const handleDeleteGroup = async (group) => {
    if (group.asset_count > 0) { toast.error(`Nhóm đang có ${group.asset_count} tài sản, không thể xóa`); return }
    if (!window.confirm(`Xóa nhóm "${group.name}"?`)) return
    try { await assetTypeGroupApi.delete(group.id); toast.success('Đã xóa nhóm'); qc.invalidateQueries(['asset-types-config']) }
    catch (err) { toast.error(err?.response?.data?.detail || 'Lỗi xóa nhóm') }
  }
  const handleDeleteAttr = async (group, attrId) => {
    if (!window.confirm('Xóa thuộc tính này?')) return
    try { await assetTypeGroupApi.deleteAttribute(group.id, attrId); toast.success('Đã xóa thuộc tính'); qc.invalidateQueries(['asset-types-config']) }
    catch (err) { toast.error(err?.response?.data?.detail || 'Lỗi xóa') }
  }
  const onGroupSaved = () => { qc.invalidateQueries(['asset-types-config']); setModal(null) }
  const onAttrSaved = () => { qc.invalidateQueries(['asset-types-config']); setModal(null) }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* Left: Groups */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, margin: 0 }}>
            Nhóm tài sản & Thuộc tính động
            {!isLoading && <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>({groups.length} nhóm)</span>}
          </h3>
          <Btn variant="primary" size="sm" onClick={() => setModal({ type: 'group' })}>+ Thêm nhóm</Btn>
        </div>
        {isLoading ? <Spinner /> : groups.map(g => (
          <Card key={g.id} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                {g.icon && <span style={{ fontSize: 22 }}>{g.icon}</span>}
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{g.name}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>#{g.code} · {g.tracking_unit || 'Cái'} · {g.type_count || 0} loại · {g.asset_count || 0} TS</div>
                </div>
              </div>
              <span style={{
                background: g.allocation_type === 'RECOVERABLE' ? '#dcfce7' : '#fef9c3',
                color: g.allocation_type === 'RECOVERABLE' ? '#15803d' : '#ca8a04',
                padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, flexShrink: 0,
              }}>{g.allocation_type === 'RECOVERABLE' ? 'Thu hồi' : 'Tiêu hao'}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
              {(g.attributes || []).length === 0 ? (
                <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Chỉ theo dõi số lượng (chưa có thuộc tính động)</div>
              ) : (g.attributes || []).map(attr => {
                const ft = FIELD_TYPE_MAP[attr.field_type] || { bg: '#f1f5f9', color: '#475569', label: attr.field_type }
                return (
                  <div key={attr.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', background: '#f8fafc', borderRadius: 6 }}>
                    <span style={{ background: ft.bg, color: ft.color, padding: '1px 6px', borderRadius: 8, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{ft.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{attr.field_label}</span>
                    {attr.field_unit && <span style={{ fontSize: 10, color: '#94a3b8' }}>({attr.field_unit})</span>}
                    {attr.is_required && <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 700 }}>Bắt buộc</span>}
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button onClick={() => setModal({ type: 'attr', group: g, attr })} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: 13, padding: '1px 4px' }}>✎</button>
                      <button onClick={() => handleDeleteAttr(g, attr.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13, padding: '1px 4px' }}>✕</button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 6, borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
              <Btn variant="ghost" size="sm" onClick={() => setModal({ type: 'group-edit', group: g })}>Chỉnh sửa</Btn>
              <Btn variant="ghost" size="sm" onClick={() => setModal({ type: 'types', group: g })}>Loại TS ({g.type_count || 0})</Btn>
              <Btn variant="ghost" size="sm" onClick={() => setModal({ type: 'attr', group: g })}>+ Thuộc tính</Btn>
              <div style={{ flex: 1 }} />
              <button onClick={() => handleDeleteGroup(g)}
                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: g.asset_count > 0 ? 'not-allowed' : 'pointer', fontSize: 12, padding: '4px 8px', opacity: g.asset_count > 0 ? 0.4 : 1 }}>Xóa</button>
            </div>
          </Card>
        ))}
      </div>

      {/* Right: Alerts + QR */}
      <div>
        <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>Quy tắc cảnh báo tự động</h3>
        <Card style={{ marginBottom: 14 }}>
          {[
            { rule: 'Hạn đăng kiểm xe', threshold: '≤ 30 ngày', type: 'Xe cơ giới', color: '#ef4444' },
            { rule: 'Hạn hiệu chuẩn',   threshold: '≤ 30 ngày', type: 'Thiết bị đo', color: '#f59e0b' },
            { rule: 'Bảo trì quá hạn',  threshold: '> 30 ngày', type: 'Mọi tài sản', color: '#f59e0b' },
            { rule: 'Tài sản hỏng',      threshold: 'Ngay lập tức', type: 'Mọi tài sản', color: '#dc2626' },
          ].map(a => (
            <div key={a.rule} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 11, alignItems: 'center' }}>
              <span style={{ background: a.color + '15', color: a.color, padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: 10, flexShrink: 0 }}>{a.rule}</span>
              <span style={{ color: '#64748b' }}>{a.threshold} — {a.type}</span>
            </div>
          ))}
        </Card>

        <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>Cơ chế xác thực QR</h3>
        <Card>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#64748b', lineHeight: 2 }}>
            <li>Khi xuất kho, hệ thống sinh <strong>QR Token duy nhất</strong> cho mỗi phiếu</li>
            <li>Người nhận scan QR bằng điện thoại</li>
            <li>Hệ thống validate token + tùy chọn ghi nhận GPS</li>
            <li>Toàn bộ tài sản cập nhật vị trí và trạng thái ngay</li>
            <li>Sự kiện <strong>QR_SCANNED</strong> ghi vào Audit Trail không thể thay đổi</li>
          </ol>
        </Card>
      </div>

      {modal?.type === 'group'      && <GroupModal onClose={() => setModal(null)} onSaved={onGroupSaved} />}
      {modal?.type === 'group-edit' && <GroupModal group={modal.group} onClose={() => setModal(null)} onSaved={onGroupSaved} />}
      {modal?.type === 'types'      && <TypeModal group={modal.group} onClose={() => setModal(null)} />}
      {modal?.type === 'attr'       && <AttributeModal group={modal.group} attr={modal.attr} onClose={() => setModal(null)} onSaved={onAttrSaved} />}
    </div>
  )
}

// ── Main ConfigPage ───────────────────────────────────────────────────
const TABS = [
  { key: 'users',  label: 'Quản lý tài khoản', icon: '👥' },
  { key: 'perms',  label: 'Phân quyền',          icon: '🔐' },
  { key: 'system', label: 'Cấu hình hệ thống',   icon: '⚙️' },
]

export default function ConfigPage() {
  const [tab, setTab] = useState('users')
  return (
    <div>
      <PageHeader title="Cấu hình & Quản trị" subtitle="Quản lý tài khoản, phân quyền và cài đặt hệ thống" />
      <div style={{ padding: '0 24px 24px' }}>
        <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '2px solid #e2e8f0' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '10px 22px', border: 'none', background: 'transparent',
              color: tab === t.key ? '#1a2744' : '#94a3b8',
              fontWeight: tab === t.key ? 800 : 500, fontSize: 13, cursor: 'pointer',
              borderBottom: tab === t.key ? '2px solid #1a2744' : '2px solid transparent',
              marginBottom: -2, transition: 'all 0.15s',
            }}>{t.icon} {t.label}</button>
          ))}
        </div>
        {tab === 'users'  && <TabUsers />}
        {tab === 'perms'  && <TabPermissions />}
        {tab === 'system' && <TabSystem />}
      </div>
    </div>
  )
}
