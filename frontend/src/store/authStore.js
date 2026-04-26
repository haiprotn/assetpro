import { create } from 'zustand'
import { authApi } from '../services/api'

// Quyền mặc định theo vai trò (phải khớp với ConfigPage.jsx)
const ROLE_DEFAULTS = {
  SUPER_ADMIN: { 'Tổng quan': ['xem'], 'Tài sản': ['xem','tạo','sửa','xóa'], 'Điều chuyển': ['xem','tạo','duyệt','từ chối','hủy'], 'Bảo trì': ['xem','tạo','hoàn tất','hủy'], 'Lịch sử': ['xem'], 'Báo cáo': ['xem','xuất file'], 'Chấm công': ['xem','nhập liệu','xuất file'], 'Cấu hình': ['toàn quyền'], 'Tài khoản': ['toàn quyền'] },
  ADMIN:       { 'Tổng quan': ['xem'], 'Tài sản': ['xem','tạo','sửa','xóa'], 'Điều chuyển': ['xem','tạo','duyệt','từ chối','hủy'], 'Bảo trì': ['xem','tạo','hoàn tất','hủy'], 'Lịch sử': ['xem'], 'Báo cáo': ['xem','xuất file'], 'Chấm công': ['xem','nhập liệu','xuất file'], 'Cấu hình': ['toàn quyền'], 'Tài khoản': ['toàn quyền'] },
  MANAGER:     { 'Tổng quan': ['xem'], 'Tài sản': ['xem','tạo','sửa'], 'Điều chuyển': ['xem','tạo','duyệt','từ chối'], 'Bảo trì': ['xem','tạo','hoàn tất'], 'Lịch sử': ['xem'], 'Báo cáo': ['xem','xuất file'], 'Chấm công': ['xem','nhập liệu','xuất file'], 'Cấu hình': [], 'Tài khoản': [] },
  OPERATOR:    { 'Tổng quan': ['xem'], 'Tài sản': ['xem','sửa'], 'Điều chuyển': ['xem','tạo'], 'Bảo trì': ['xem','tạo','hoàn tất'], 'Lịch sử': ['xem'], 'Báo cáo': [], 'Chấm công': ['xem','nhập liệu'], 'Cấu hình': [], 'Tài khoản': [] },
  VIEWER:      { 'Tổng quan': ['xem'], 'Tài sản': ['xem'], 'Điều chuyển': ['xem'], 'Bảo trì': ['xem'], 'Lịch sử': [], 'Báo cáo': [], 'Chấm công': ['xem'], 'Cấu hình': [], 'Tài khoản': [] },
}

// Tính quyền hiệu lực = quyền mặc định của role + override tùy chỉnh
function effectivePermissions(role, customPerms) {
  const defaults = ROLE_DEFAULTS[role] || {}
  if (!customPerms || Object.keys(customPerms).length === 0) return defaults
  return { ...defaults, ...customPerms }
}

const storedUser = localStorage.getItem('auth_user')

export const useAuthStore = create((set, get) => ({
  user: storedUser ? JSON.parse(storedUser) : null,
  token: localStorage.getItem('access_token'),
  isAuthenticated: !!localStorage.getItem('access_token'),

  login: async (username, password) => {
    const { data } = await authApi.login(username, password)
    const user = {
      role: data.role,
      username: data.username,
      permissions: data.permissions || {},
    }
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    set({ token: data.access_token, isAuthenticated: true, user })
  },

  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('auth_user')
    set({ token: null, isAuthenticated: false, user: null })
  },

  // Kiểm tra quyền: hasPermission('Tài sản', 'tạo')
  hasPermission: (module, action) => {
    const { user } = get()
    if (!user) return false
    // SUPER_ADMIN và ADMIN luôn có toàn quyền
    if (['SUPER_ADMIN', 'ADMIN'].includes(user.role)) return true
    const perms = effectivePermissions(user.role, user.permissions)
    const modulePerms = perms[module] || []
    // 'toàn quyền' nghĩa là có tất cả
    if (modulePerms.includes('toàn quyền')) return true
    return modulePerms.includes(action)
  },

  // Lấy toàn bộ quyền hiệu lực của user hiện tại
  getEffectivePermissions: () => {
    const { user } = get()
    if (!user) return {}
    return effectivePermissions(user.role, user.permissions)
  },

  // Trả về danh sách phòng ban được phép chấm công
  // null = tất cả, [] = không có quyền, [id,...] = danh sách cụ thể
  getAttendanceDepts: () => {
    const { user } = get()
    if (!user) return []
    if (['SUPER_ADMIN', 'ADMIN'].includes(user.role)) return null // tất cả
    const perms = effectivePermissions(user.role, user.permissions)
    const depts = perms['Chấm công_phòng_ban']
    return Array.isArray(depts) && depts.length ? depts : null
  },
}))
