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
  uploadImage:  (id, fd) => api.post(`/assets/${id}/upload-image`, fd),
  deleteImage:  (id)     => api.delete(`/assets/${id}/image`),
  uploadDoc:   (fd)     => api.post('/assets/upload-doc', fd),
  duplicate:   (id) => api.post(`/assets/${id}/duplicate`),
  getQrImage:  (id) => api.get(`/assets/${id}/qr-image`, { responseType: 'blob' }),
  getLifecycle: (id) => api.get(`/assets/${id}/lifecycle`),
  trash:           () => api.get('/assets/trash'),
  permanentDelete: (id) => api.delete(`/assets/${id}/permanent`),
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
  list:   ()         => api.get('/locations'),
  create: (data)     => api.post('/locations', data),
  update: (id, data) => api.put(`/locations/${id}`, data),
  delete: (id)       => api.delete(`/locations/${id}`),
}
export const personnelApi = {
  // Personnel CRUD
  list:            (params) => api.get('/personnel', { params }),
  getAll:          ()       => api.get('/personnel/all'),
  getById:         (id)     => api.get(`/personnel/${id}`),
  create:          (data)   => api.post('/personnel', data),
  update:          (id, data) => api.put(`/personnel/${id}`, data),
  delete:          (id)     => api.delete(`/personnel/${id}`),
  // Contracts
  listContracts:   (id)     => api.get(`/personnel/${id}/contracts`),
  createContract:  (id, data) => api.post(`/personnel/${id}/contracts`, data),
  updateContract:  (cid, data) => api.put(`/personnel/contracts/${cid}`, data),
  deleteContract:  (cid)    => api.delete(`/personnel/contracts/${cid}`),
  // Positions
  listPositions:   ()       => api.get('/personnel/positions/list'),
  createPosition:  (data)   => api.post('/personnel/positions', data),
  // Job Titles
  listJobTitles:   ()       => api.get('/personnel/job-titles/list'),
  createJobTitle:  (data)   => api.post('/personnel/job-titles', data),
  // Contract Types
  listContractTypes: ()     => api.get('/personnel/contract-types/list'),
  // Import / Export
  importExcel: (file, updateExisting = false, hasHintRow = false) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post(`/personnel/import?update_existing=${updateExisting}&has_hint_row=${hasHintRow}`, fd)
  },
  exportExcel: (params) => api.get('/personnel/export', { params, responseType: 'blob' }),
  downloadTemplate: () => api.get('/personnel/import-template', { responseType: 'blob' }),
  // Documents
  listDocuments:  (id) => api.get(`/personnel/${id}/documents`),
  uploadDocument: (id, file, docType, notes) => {
    const fd = new FormData()
    fd.append('file', file)
    const params = new URLSearchParams({ doc_type: docType })
    if (notes) params.append('notes', notes)
    return api.post(`/personnel/${id}/documents?${params}`, fd)
  },
  deleteDocument: (docId) => api.delete(`/personnel/documents/${docId}`),
  listDocumentTypes: () => api.get('/personnel/documents/types'),
}

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
export const departmentApi = deptApi

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


// ── Timesheet legacy (kept for backward compat) ──────────────
export const timesheetApi = {
  list:      (params) => api.get('/timesheet', { params }),
  bulkSave:  (rows)   => api.post('/timesheet/rows/bulk', rows),
  deleteRow: (id)     => api.delete(`/timesheet/rows/${id}`),
  export:    (params) => api.get('/timesheet/export', { params, responseType: 'blob' }),
}

// ── Attendance v2 ────────────────────────────────────────────
export const attendanceApi = {
  // Attendance records
  list:   (params)          => api.get('/attendance', { params }),
  upsert: (pid, date, data) => api.put(`/attendance/${pid}/${date}`, data),
  // Work logs (liên kết departments — phòng ban = bộ phận)
  listWorkLogs:  (params)   => api.get('/attendance/work-logs', { params }),
  createWorkLog: (data)     => api.post('/attendance/work-logs', data),
  updateWorkLog: (id, data) => api.put(`/attendance/work-logs/${id}`, data),
  deleteWorkLog: (id)       => api.delete(`/attendance/work-logs/${id}`),
  // Report & export
  report: (params)          => api.get('/attendance/report', { params }),
  export: (params)          => api.get('/attendance/export', { params, responseType: 'blob' }),
}

export default api
