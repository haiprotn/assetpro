import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001/api/v1',
  timeout: 30000,
})

// Attach JWT token + skip ngrok browser warning
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  config.headers['ngrok-skip-browser-warning'] = 'true'
  return config
})

// Handle 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('access_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ── Assets ──────────────────────────────────────────────────
export const assetApi = {
  list:        (params) => api.get('/assets', { params }),
  getById:     (id) => api.get(`/assets/${id}`),
  getByCode:   (code) => api.get(`/assets/code/${code}`),
  create:      (data) => api.post('/assets', data),
  update:      (id, data) => api.put(`/assets/${id}`, data),
  delete:      (id) => api.delete(`/assets/${id}`),
  uploadImage: (id, fd) => api.post(`/assets/${id}/upload-image`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  uploadDoc:   (fd)     => api.post('/assets/upload-doc', fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getQrImage:  (id) => api.get(`/assets/${id}/qr-image`, { responseType: 'blob' }),
  getLifecycle: (id) => api.get(`/assets/${id}/lifecycle`),
  alerts:      () => api.get('/assets/alerts'),
  export:      (params) => api.get('/assets/export', { params, responseType: 'blob' }),
}

// ── Asset Types ─────────────────────────────────────────────
export const assetTypeApi = {
  list: () => api.get('/asset-types'),
}

// ── Transfers ───────────────────────────────────────────────
export const transferApi = {
  list:         (params) => api.get('/transfers', { params }),
  getById:      (id) => api.get(`/transfers/${id}`),
  create:       (data) => api.post('/transfers', data),
  submit:       (id) => api.post(`/transfers/${id}/submit`),
  approve:      (id) => api.post(`/transfers/${id}/approve`),
  reject:       (id, reason) => api.post(`/transfers/${id}/reject`, null, { params: { reason } }),
  dispatch:     (id) => api.post(`/transfers/${id}/dispatch`),
  verifyQr:     (id, data) => api.post(`/transfers/${id}/verify-qr`, data),
  qrLookup:     (token) => api.get(`/transfers/qr-lookup/${token}`),
  getItems:     (id) => api.get(`/transfers/${id}/items`),
  cancel:       (id, reason) => api.post(`/transfers/${id}/cancel`, null, { params: { reason } }),
}

// ── Lifecycle / Audit trail ──────────────────────────────────
export const lifecycleApi = {
  list: (params) => api.get('/lifecycle', { params }),
}

// ── Maintenance ─────────────────────────────────────────────
export const maintenanceApi = {
  list:     (params) => api.get('/maintenance', { params }),
  create:   (data)   => api.post('/maintenance', data),
  complete: (id, data) => api.post(`/maintenance/${id}/complete`, data),
  cancel:   (id)     => api.post(`/maintenance/${id}/cancel`),
}

// ── Dashboard ───────────────────────────────────────────────
export const dashboardApi = {
  summary:    () => api.get('/dashboard/summary'),
  byLocation: () => api.get('/dashboard/by-location'),
  alerts:     () => api.get('/dashboard/alerts'),
}

// ── Supporting resources ────────────────────────────────────
export const locationApi  = {
  list:   ()     => api.get('/locations'),
  create: (data) => api.post('/locations', data),
}
export const personnelApi = { list: () => api.get('/personnel') }

export const supplierApi = {
  list:   ()         => api.get('/suppliers'),
  create: (data)     => api.post('/suppliers', data),
  update: (id, data) => api.put(`/suppliers/${id}`, data),
  delete: (id)       => api.delete(`/suppliers/${id}`),
}

export const deptApi = {
  list:   ()         => api.get('/departments'),
  create: (data)     => api.post('/departments', data),
  update: (id, data) => api.put(`/departments/${id}`, data),
  delete: (id)       => api.delete(`/departments/${id}`),
}

export const assetTypeGroupApi = {
  list:            ()                      => api.get('/asset-types'),
  create:          (data)                  => api.post('/asset-types', data),
  update:          (id, data)              => api.put(`/asset-types/${id}`, data),
  delete:          (id)                    => api.delete(`/asset-types/${id}`),
  listFlatTypes:   ()                      => api.get('/asset-types/flat-types'),
  listTypes:       (groupId)               => api.get(`/asset-types/${groupId}/types`),
  createType:      (groupId, data)         => api.post(`/asset-types/${groupId}/types`, data),
  deleteType:      (groupId, typeId)       => api.delete(`/asset-types/${groupId}/types/${typeId}`),
  createAttribute: (groupId, data)         => api.post(`/asset-types/${groupId}/attributes`, data),
  updateAttribute: (groupId, attrId, data) => api.put(`/asset-types/${groupId}/attributes/${attrId}`, data),
  deleteAttribute: (groupId, attrId)       => api.delete(`/asset-types/${groupId}/attributes/${attrId}`),
}

// ── Auth ────────────────────────────────────────────────────
export const authApi = {
  login: (username, password) => {
    const form = new FormData()
    form.append('username', username)
    form.append('password', password)
    return api.post('/auth/login', form)
  },
  me: () => api.get('/users/me'),
}

// ── Users & Permissions ──────────────────────────────────────
export const userApi = {
  list:          (params)           => api.get('/users', { params }),
  create:        (data)             => api.post('/users', data),
  update:        (id, data)         => api.put(`/users/${id}`, data),
  resetPassword: (id, newPassword)  => api.post(`/users/${id}/reset-password`, { new_password: newPassword }),
  delete:        (id)               => api.delete(`/users/${id}`),
}

export default api
