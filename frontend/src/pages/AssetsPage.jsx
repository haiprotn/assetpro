import { useState, useRef } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { assetApi, assetTypeApi, assetTypeGroupApi, locationApi } from '../services/api'
import { Card, PageHeader, StatusBadge, Btn, fmtVnd, DynAttrBadges, Spinner } from '../components/ui'
import AssetFormModal from './AssetFormModal'

const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001/api/v1'
const IMG_HOST = BASE.replace('/api/v1', '')
const importApi = axios.create({ baseURL: BASE, timeout: 180000 })
importApi.interceptors.request.use(cfg => {
  const token = localStorage.getItem('access_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

const fmtDate = d => {
  if (!d) return '—'
  try { const [y, m, day] = String(d).split('-'); return `${day}/${m}/${y}` }
  catch { return d }
}

// ── Column definitions ─────────────────────────────────────────────────────

const TABLE_COLUMNS = [
  { key: 'anh',          label: 'Ảnh',               def: true },
  { key: 'ma_ts',        label: 'Mã TS',             def: true,  sort: 'asset_code' },
  { key: 'barcode',      label: 'Barcode',            def: false },
  { key: 'ten_ts',       label: 'Tên tài sản',       def: true,  sort: 'name' },
  { key: 'loai_ts',      label: 'Loại tài sản',      def: true,  sort: 'asset_type' },
  { key: 'trang_thai',   label: 'Trạng thái',        def: true,  sort: 'status' },
  { key: 'vi_tri',       label: 'Vị trí',            def: true,  sort: 'location' },
  { key: 'phong_ban',    label: 'Phòng ban',         def: false, sort: 'department' },
  { key: 'nguyen_gia',   label: 'Nguyên giá',        def: true,  sort: 'original_value' },
  { key: 'gia_tri_ht',   label: 'Giá trị hiện tại',  def: false },
  { key: 'khau_hao',     label: 'Giá trị KH',        def: false },
  { key: 'model_series', label: 'Model/Series',      def: false },
  { key: 'so_luong',     label: 'Số lượng',          def: false },
  { key: 'han_dk',       label: 'Hạn đăng kiểm',    def: false },
  { key: 'nha_cung_cap', label: 'Nhà cung cấp',     def: false },
  { key: 'so_khung',     label: 'Số Khung',          def: false },
  { key: 'so_dong_co',   label: 'Số Động cơ',        def: false },
  { key: 'license_plate',label: 'Biển số xe',        def: false },
  { key: 'ngay_mua',     label: 'Ngày mua',          def: false, sort: 'purchase_date' },
]

const EXPORT_COLUMNS = [
  { key: 'phap_nhan',            label: 'Pháp nhân sở hữu',      group: 'Thông tin chung' },
  { key: 'ma_qrcode',            label: 'Mã QRCode',              group: 'Thông tin chung' },
  { key: 'anh_tai_san',          label: 'Ảnh tài sản (tên file)', group: 'Thông tin chung' },
  { key: 'ma_ts',                label: 'Mã TS',                  group: 'Thông tin chung' },
  { key: 'barcode',              label: 'Barcode',                group: 'Thông tin chung' },
  { key: 'ten_ts',               label: 'Tên tài sản',            group: 'Thông tin chung' },
  { key: 'loai_ts',              label: 'Loại tài sản',           group: 'Thông tin chung' },
  { key: 'nhom_ts',              label: 'Nhóm tài sản',           group: 'Thông tin chung' },
  { key: 'trang_thai',           label: 'Trạng thái',             group: 'Thông tin chung' },
  { key: 'vi_tri',               label: 'Vị trí',                 group: 'Thông tin chung' },
  { key: 'phong_ban',            label: 'Phòng ban',              group: 'Thông tin chung' },
  { key: 'model_series',         label: 'Model / Series',         group: 'Thông tin chung' },
  { key: 'mo_ta',                label: 'Mô tả',                  group: 'Thông tin chung' },
  { key: 'dien_giai_tinh_trang', label: 'Diễn giải tình trạng',  group: 'Thông tin chung' },
  { key: 'ngay_tao',             label: 'Ngày tạo',               group: 'Thông tin chung' },
  { key: 'so_luong',             label: 'Số lượng',               group: 'Số lượng' },
  { key: 'sl_bao_tri',           label: 'SL Bảo trì',             group: 'Số lượng' },
  { key: 'sl_con_lai',           label: 'SL còn lại',             group: 'Số lượng' },
  { key: 'sl_thanh_ly',          label: 'SL thanh lý',            group: 'Số lượng' },
  { key: 'sl_mat',               label: 'SL mất',                 group: 'Số lượng' },
  { key: 'sl_huy',               label: 'SL huỷ',                 group: 'Số lượng' },
  { key: 'sl_hong',              label: 'SL hỏng',                group: 'Số lượng' },
  { key: 'nguyen_gia',           label: 'Nguyên giá',             group: 'Tài chính' },
  { key: 'gia_mua',              label: 'Giá mua',                group: 'Tài chính' },
  { key: 'gia_tri_hien_tai',     label: 'Giá trị hiện tại',       group: 'Tài chính' },
  { key: 'gia_tri_khau_hao',     label: 'Giá trị khấu hao',       group: 'Tài chính' },
  { key: 'khau_hao_thang',       label: 'Khấu hao (tháng)',       group: 'Tài chính' },
  { key: 'da_vay',               label: 'Đã vay',                 group: 'Tài chính' },
  { key: 'ngay_mua',             label: 'Ngày mua',               group: 'Ngày tháng' },
  { key: 'ngay_bao_tang',        label: 'Ngày báo tăng',          group: 'Ngày tháng' },
  { key: 'ngay_ket_thuc_bh',     label: 'Ngày kết thúc BH',       group: 'Ngày tháng' },
  { key: 'ngay_het_han',         label: 'Ngày hết hạn',           group: 'Ngày tháng' },
  { key: 'thoi_gian_bh',         label: 'Thời gian BH (tháng)',   group: 'Ngày tháng' },
  { key: 'han_dang_kiem',        label: 'Hạn đăng kiểm',          group: 'Ngày tháng' },
  { key: 'han_hieu_chuan',       label: 'Hạn hiệu chuẩn',         group: 'Ngày tháng' },
  { key: 'nha_cung_cap',         label: 'Nhà cung cấp',           group: 'Nhà cung cấp' },
  { key: 'dia_chi_ncc',          label: 'Địa chỉ NCC',            group: 'Nhà cung cấp' },
  { key: 'dien_thoai_ncc',       label: 'Điện thoại NCC',         group: 'Nhà cung cấp' },
  { key: 'so_khung',             label: 'Số Khung',               group: 'Xe / Máy' },
  { key: 'so_dong_co',           label: 'Số Động cơ',             group: 'Xe / Máy' },
  { key: 'bien_so',              label: 'Biển số xe',             group: 'Xe / Máy' },
  { key: 'nam_nuoc_sx',          label: 'Năm - Nước sản xuất',    group: 'Xe / Máy' },
  { key: 'thue_bao',             label: 'Thuê bao',               group: 'Khác' },
  { key: 'thong_so_thiet_bi',    label: 'Thông số thiết bị',      group: 'Khác' },
  { key: 'so_file_dinh_kem',     label: 'Số file đính kèm',       group: 'Khác' },
]

const DEFAULT_EXPORT_KEYS = [
  'ma_ts', 'ten_ts', 'loai_ts', 'nhom_ts', 'trang_thai',
  'vi_tri', 'phong_ban', 'nguyen_gia', 'ngay_mua', 'model_series',
  'so_khung', 'so_dong_co', 'nha_cung_cap',
]

const TABLE_COL_TO_EXPORT_KEY = {
  anh: 'anh_tai_san', ma_ts: 'ma_ts', barcode: 'barcode', ten_ts: 'ten_ts',
  loai_ts: 'loai_ts', trang_thai: 'trang_thai', vi_tri: 'vi_tri',
  phong_ban: 'phong_ban', nguyen_gia: 'nguyen_gia', gia_tri_ht: 'gia_tri_hien_tai',
  khau_hao: 'gia_tri_khau_hao', model_series: 'model_series', so_luong: 'so_luong',
  han_dk: 'han_dang_kiem', so_khung: 'so_khung', so_dong_co: 'so_dong_co',
  license_plate: 'bien_so', nha_cung_cap: 'nha_cung_cap', ngay_mua: 'ngay_mua',
}

const LS_COLS = 'assets_visible_cols'
const getInitialCols = () => {
  try {
    const saved = localStorage.getItem(LS_COLS)
    if (saved) return JSON.parse(saved)
  } catch {}
  return TABLE_COLUMNS.filter(c => c.def).map(c => c.key)
}

// ── ImportModal ────────────────────────────────────────────────────────────

function ImportModal({ onClose, onDone }) {
  const [file, setFile]       = useState(null)
  const [preview, setPreview] = useState(null)
  const [result, setResult]   = useState(null)
  const [step, setStep]       = useState('idle')
  const [msg, setMsg]         = useState('')
  const [progress, setProgress] = useState(0)
  const fileRef = useRef()

  const handleFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.name.match(/\.(xlsx|xls)$/i)) { alert('Chỉ hỗ trợ file .xlsx hoặc .xls'); return }
    setFile(f); setPreview(null); setResult(null); setStep('idle')
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile({ target: { files: [f] } })
  }

  const doPreview = async () => {
    if (!file) return
    setStep('previewing'); setMsg('Đang đọc file...')
    const fd = new FormData(); fd.append('file', file)
    try {
      const res = await importApi.post('/data/import/preview', fd)
      setPreview(res.data); setStep('idle'); setMsg('')
    } catch (e) {
      setStep('error'); setMsg(e.response?.data?.detail || 'Lỗi đọc file')
    }
  }

  const doImport = async () => {
    if (!file) return
    setStep('importing'); setMsg('Đang import dữ liệu và ảnh... vui lòng chờ'); setProgress(0)
    const fd = new FormData(); fd.append('file', file)
    try {
      const timer = setInterval(() => setProgress(p => Math.min(p + 5, 88)), 800)
      const res = await importApi.post('/data/import/execute', fd)
      clearInterval(timer); setProgress(100)
      setResult(res.data); setStep('done'); setMsg('')
    } catch (e) {
      setStep('error'); setMsg(e.response?.data?.detail || 'Lỗi khi import')
    }
  }

  const reset = () => {
    setFile(null); setPreview(null); setResult(null)
    setStep('idle'); setMsg(''); setProgress(0)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'white', borderRadius: 16, width: '100%', maxWidth: 740,
        maxHeight: '90vh', overflowY: 'auto', padding: 28, position: 'relative'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#1a2744' }}>📥 Import Tài sản từ Excel</div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Nhập dữ liệu từ phần mềm cũ — hỗ trợ file .xlsx có ảnh nhúng</div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: '50%', border: 'none',
            background: '#f1f5f9', cursor: 'pointer', fontSize: 16, color: '#64748b'
          }}>✕</button>
        </div>

        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: '#1a2744' }}>
            📁 Bước 1 — Chọn file Excel
          </div>
          <div
            onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current.click()}
            style={{
              border: `2px dashed ${file ? '#10b981' : '#cbd5e1'}`,
              borderRadius: 10, padding: '24px 16px', textAlign: 'center',
              cursor: 'pointer', background: file ? '#f0fdf4' : '#f8fafc', transition: 'all .2s',
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 6 }}>{file ? '✅' : '📂'}</div>
            {file ? (
              <>
                <div style={{ fontWeight: 700, color: '#10b981', fontSize: 14 }}>{file.name}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                  {(file.size / 1024 / 1024).toFixed(1)} MB — click để đổi file
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 600, color: '#475569', fontSize: 13 }}>Kéo thả hoặc click để chọn file</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Hỗ trợ .xlsx — cả file có ảnh nhúng và không có ảnh</div>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
          {file && (
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button onClick={doPreview} disabled={step === 'previewing'} style={{
                padding: '8px 18px', background: '#1a2744', color: '#fff',
                border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 600, fontSize: 13
              }}>
                {step === 'previewing' ? '⏳ Đang đọc...' : '🔍 Xem trước'}
              </button>
              <button onClick={reset} style={{
                padding: '8px 14px', background: '#f1f5f9', color: '#64748b',
                border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13
              }}>🗑️ Xoá</button>
            </div>
          )}
        </Card>

        {preview && step !== 'done' && (
          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: '#1a2744' }}>
              🔍 Bước 2 — Xem trước dữ liệu
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              {[
                { label: 'Bản ghi', value: preview.total_rows, color: '#1a2744', bg: '#e0e7ff' },
                { label: 'Ảnh nhúng', value: preview.embedded_images, color: preview.embedded_images > 0 ? '#7c3aed' : '#94a3b8', bg: preview.embedded_images > 0 ? '#ede9fe' : '#f1f5f9' },
                { label: 'Số cột', value: preview.columns, color: '#0369a1', bg: '#e0f2fe' },
              ].map(s => (
                <div key={s.label} style={{ padding: '10px 18px', background: s.bg, borderRadius: 8, minWidth: 110 }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
            {preview.embedded_images > 0 && (
              <div style={{ padding: '8px 12px', background: '#ede9fe', borderRadius: 7, fontSize: 12, color: '#5b21b6', marginBottom: 12, fontWeight: 500 }}>
                🖼️ Phát hiện <strong>{preview.embedded_images} ảnh</strong> nhúng — sẽ tự động extract và lưu khi import.
              </div>
            )}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#1a2744', color: '#fff' }}>
                    {['Mã TS', 'Tên tài sản', 'Trạng thái', 'Vị trí', 'Nguyên giá', 'Ảnh'].map(h => (
                      <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.samples.map((s, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #e2e8f0', background: i % 2 ? '#f8fafc' : '#fff' }}>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: '#1a2744', fontWeight: 700 }}>{s.ma_ts}</td>
                      <td style={{ padding: '7px 10px' }}>{s.ten_ts}</td>
                      <td style={{ padding: '7px 10px' }}>
                        <span style={{
                          padding: '2px 7px', borderRadius: 8, fontSize: 10, fontWeight: 600,
                          background: s.trang_thai === 'Đang sử dụng' ? '#dcfce7' : '#fef3c7',
                          color: s.trang_thai === 'Đang sử dụng' ? '#15803d' : '#b45309',
                        }}>{s.trang_thai}</span>
                      </td>
                      <td style={{ padding: '7px 10px', color: '#64748b' }}>{s.vi_tri || '—'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                        {s.nguyen_gia ? Number(s.nguyen_gia).toLocaleString('vi-VN') + ' ₫' : '—'}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'center' }}>{s.has_image ? '🖼️' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Reference tables that will be created */}
            {(preview.new_departments?.length > 0 || preview.new_locations?.length > 0 ||
              preview.new_suppliers?.length > 0 || preview.new_asset_types?.length > 0) && (
              <div style={{ marginTop: 12, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0369a1', marginBottom: 8 }}>
                  📋 Dữ liệu tham chiếu sẽ được tạo mới:
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Phòng ban', items: preview.new_departments, color: '#7c3aed', bg: '#ede9fe' },
                    { label: 'Vị trí',    items: preview.new_locations,   color: '#0369a1', bg: '#e0f2fe' },
                    { label: 'Nhà CC',    items: preview.new_suppliers,   color: '#b45309', bg: '#fef3c7' },
                    { label: 'Loại TS',   items: preview.new_asset_types, color: '#15803d', bg: '#dcfce7' },
                  ].filter(x => x.items?.length > 0).map(({ label, items, color, bg }) => (
                    <div key={label} style={{ background: bg, borderRadius: 6, padding: '6px 10px', minWidth: 90 }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color }}>{items.length}</div>
                      <div style={{ fontSize: 10, color: '#475569' }}>{label} mới</div>
                      <div style={{ fontSize: 10, color, marginTop: 3, maxHeight: 50, overflowY: 'auto' }}>
                        {items.slice(0, 5).map(x => x.name).join(', ')}
                        {items.length > 5 && ` +${items.length - 5} khác`}
                      </div>
                    </div>
                  ))}
                </div>
                {preview.to_skip > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#92400e' }}>
                    ⏭️ {preview.to_skip} bản ghi đã tồn tại sẽ bị bỏ qua — {preview.to_import} sẽ được import.
                  </div>
                )}
              </div>
            )}
            <div style={{ marginTop: 12, padding: '8px 12px', background: '#fef3c7', borderRadius: 7, fontSize: 12, color: '#92400e' }}>
              ⚠️ Tài sản có Mã TS đã tồn tại sẽ bị bỏ qua (không ghi đè).
            </div>
            <div style={{ marginTop: 12 }}>
              <button onClick={doImport} style={{
                padding: '10px 24px', background: '#10b981', color: '#fff',
                border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 14
              }}>
                🚀 Bắt đầu Import {preview.to_import ?? preview.total_rows} bản ghi
                {preview.embedded_images > 0 && ` + ${preview.embedded_images} ảnh`}
              </button>
            </div>
          </Card>
        )}

        {step === 'importing' && (
          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: '#f59e0b' }}>⏳ Đang import...</div>
            <div style={{ background: '#e2e8f0', borderRadius: 999, height: 12, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{
                height: '100%', background: 'linear-gradient(90deg, #1a2744, #10b981)',
                borderRadius: 999, width: `${progress}%`, transition: 'width .5s ease'
              }} />
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{msg} ({progress}%)</div>
          </Card>
        )}

        {result && step === 'done' && (
          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, color: '#10b981' }}>✅ Import hoàn tất!</div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'Tài sản import', value: result.imported, color: '#15803d', bg: '#dcfce7' },
                { label: 'Ảnh đã lưu', value: result.images_saved, color: '#5b21b6', bg: '#ede9fe' },
                { label: 'Bỏ qua (trùng)', value: result.skipped, color: '#b45309', bg: '#fef3c7' },
                { label: 'Lỗi', value: result.errors?.length || 0, color: '#b91c1c', bg: '#fee2e2' },
              ].map(s => (
                <div key={s.label} style={{ padding: '12px 16px', background: s.bg, borderRadius: 8, minWidth: 110 }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: '10px 14px', background: '#f0fdf4', borderRadius: 7, fontSize: 13, color: '#15803d', fontWeight: 600, marginBottom: 12 }}>
              {result.message}
            </div>
            {result.errors?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#b91c1c', marginBottom: 5 }}>⚠️ Lỗi ({result.errors.length}):</div>
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, padding: 10, maxHeight: 140, overflowY: 'auto' }}>
                  {result.errors.map((e, i) => (
                    <div key={i} style={{ fontSize: 11, fontFamily: 'monospace', color: '#7f1d1d', marginBottom: 3 }}>{e}</div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { onDone(); onClose() }} style={{
                padding: '9px 18px', background: '#1a2744', color: '#fff',
                border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 600, fontSize: 13
              }}>✅ Xem danh sách tài sản</button>
              <button onClick={reset} style={{
                padding: '9px 14px', background: '#f1f5f9', color: '#64748b',
                border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13
              }}>🔄 Import file khác</button>
            </div>
          </Card>
        )}

        {step === 'error' && (
          <Card style={{ marginBottom: 16 }}>
            <div style={{ color: '#b91c1c', fontWeight: 700, marginBottom: 8 }}>❌ Có lỗi xảy ra</div>
            <div style={{ fontSize: 12, color: '#7f1d1d', background: '#fef2f2', padding: 10, borderRadius: 7, marginBottom: 10 }}>{msg}</div>
            <button onClick={() => setStep('idle')} style={{ padding: '7px 14px', background: '#f1f5f9', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13 }}>← Thử lại</button>
          </Card>
        )}

        {step === 'idle' && !preview && (
          <Card>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: '#1a2744' }}>📋 Hướng dẫn</div>
            <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.9 }}>
              <div>✅ <strong>Hỗ trợ file có ảnh nhúng</strong> — ảnh tự động extract và lưu vào server</div>
              <div>✅ <strong>Tự động tạo:</strong> Vị trí, Phòng ban, Nhà cung cấp, Loại TS nếu chưa có</div>
              <div>✅ <strong>Bỏ qua trùng:</strong> Mã TS đã tồn tại sẽ không bị ghi đè</div>
              <div>⚠️ <strong>File cần có cột:</strong> <code>Mã TS</code>, <code>Tên tài sản</code>, <code>Trạng thái</code></div>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

// ── ColPicker ──────────────────────────────────────────────────────────────

function ColPicker({ visible, onChange, dynCols = [] }) {
  const [open, setOpen] = useState(false)
  const allCols = [...TABLE_COLUMNS, ...dynCols]

  const toggle = (key) => {
    const next = visible.includes(key)
      ? visible.filter(k => k !== key)
      : [...visible, key]
    const ordered = allCols.map(c => c.key).filter(k => next.includes(k))
    onChange(ordered)
    localStorage.setItem(LS_COLS, JSON.stringify(ordered))
  }

  return (
    <div style={{ position: 'relative' }}>
      <Btn variant="outline" onClick={() => setOpen(o => !o)}>
        ⚙️ Cột hiển thị
      </Btn>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 6,
            background: 'white', border: '1px solid #e2e8f0', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100,
            padding: '12px 14px', width: 240, maxHeight: 400, overflowY: 'auto',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Chọn cột hiển thị
            </div>
            {TABLE_COLUMNS.map(col => (
              <label key={col.key} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 4px', cursor: 'pointer', borderRadius: 5,
                fontSize: 13, color: '#1e293b',
                background: visible.includes(col.key) ? '#f0f4ff' : 'transparent',
              }}>
                <input
                  type="checkbox"
                  checked={visible.includes(col.key)}
                  onChange={() => toggle(col.key)}
                  style={{ width: 14, height: 14, cursor: 'pointer' }}
                />
                {col.label}
              </label>
            ))}
            {dynCols.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', margin: '10px 0 6px', textTransform: 'uppercase', letterSpacing: 0.5, borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
                  Thuộc tính động
                </div>
                {dynCols.map(col => (
                  <label key={col.key} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 4px', cursor: 'pointer', borderRadius: 5,
                    fontSize: 13, color: '#1e293b',
                    background: visible.includes(col.key) ? '#f0f4ff' : 'transparent',
                  }}>
                    <input
                      type="checkbox"
                      checked={visible.includes(col.key)}
                      onChange={() => toggle(col.key)}
                      style={{ width: 14, height: 14, cursor: 'pointer' }}
                    />
                    {col.label}
                  </label>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── ExportModal ────────────────────────────────────────────────────────────

function ExportModal({ onClose, currentFilters, visibleCols = [] }) {
  const visibleExportKeys = visibleCols
    .map(k => TABLE_COL_TO_EXPORT_KEY[k])
    .filter(Boolean)
  const [selectedCols, setSelectedCols] = useState(
    visibleExportKeys.length > 0 ? visibleExportKeys : DEFAULT_EXPORT_KEYS
  )
  const [mode, setMode] = useState(visibleExportKeys.length > 0 ? 'visible' : 'custom')
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  const toggleCol = (key) => {
    setSelectedCols(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  const doExport = async () => {
    const cols = mode === 'all' ? EXPORT_COLUMNS.map(c => c.key)
      : mode === 'visible' ? visibleExportKeys
      : selectedCols
    if (cols.length === 0) { setError('Vui lòng chọn ít nhất 1 cột'); return }
    setExporting(true); setError('')
    try {
      const params = new URLSearchParams()
      params.append('format', 'xlsx')
      cols.forEach(c => params.append('columns', c))
      if (currentFilters.status) params.append('status', currentFilters.status)
      if (currentFilters.group_code) params.append('group_code', currentFilters.group_code)

      const res = await importApi.get(`/assets/export?${params.toString()}`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      const d = new Date()
      a.download = `tai-san-${d.getDate().toString().padStart(2,'0')}${(d.getMonth()+1).toString().padStart(2,'0')}${d.getFullYear()}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      onClose()
    } catch (e) {
      let msg = e.message
      if (e.response?.data instanceof Blob) {
        try {
          const text = await e.response.data.text()
          const json = JSON.parse(text)
          msg = json.detail || json.message || text
        } catch { /* keep original message */ }
      } else if (e.response?.data?.detail) {
        msg = e.response.data.detail
      }
      setError('Lỗi xuất file: ' + msg)
    } finally {
      setExporting(false)
    }
  }

  const groups = [...new Set(EXPORT_COLUMNS.map(c => c.group))]

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'white', borderRadius: 16, width: '100%', maxWidth: 700,
        maxHeight: '90vh', overflowY: 'auto', padding: 28,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#1a2744' }}>📤 Xuất Excel</div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Chọn các cột cần xuất ra file — ảnh được thay bằng tên file</div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: '50%', border: 'none',
            background: '#f1f5f9', cursor: 'pointer', fontSize: 16, color: '#64748b'
          }}>✕</button>
        </div>

        {/* Mode selector */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { v: 'visible', label: '👁️ Cột đang hiển thị',   desc: `${visibleExportKeys.length} cột` },
            { v: 'all',     label: '✅ Xuất tất cả cột',       desc: `${EXPORT_COLUMNS.length} cột` },
            { v: 'custom',  label: '⚙️ Chọn cột tùy chỉnh',   desc: `${selectedCols.length} cột đã chọn` },
          ].map(({ v, label, desc }) => (
            <div key={v} onClick={() => setMode(v)} style={{
              flex: 1, padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
              border: `2px solid ${mode === v ? '#1a2744' : '#e2e8f0'}`,
              background: mode === v ? '#f0f4ff' : 'white',
            }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#1a2744' }}>{label}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{desc}</div>
            </div>
          ))}
        </div>

        {/* Column picker */}
        {mode === 'custom' && (
          <Card style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#1a2744' }}>Chọn cột xuất</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setSelectedCols(EXPORT_COLUMNS.map(c => c.key))} style={{
                  fontSize: 11, color: '#1a2744', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline'
                }}>Chọn tất cả</button>
                <button onClick={() => setSelectedCols([])} style={{
                  fontSize: 11, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline'
                }}>Bỏ tất cả</button>
              </div>
            </div>
            {groups.map(group => (
              <div key={group} style={{ marginBottom: 14 }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: '#94a3b8',
                  textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6
                }}>{group}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  {EXPORT_COLUMNS.filter(c => c.group === group).map(col => (
                    <label key={col.key} style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px',
                      cursor: 'pointer', borderRadius: 5, fontSize: 12,
                      background: selectedCols.includes(col.key) ? '#f0f4ff' : 'transparent',
                    }}>
                      <input
                        type="checkbox"
                        checked={selectedCols.includes(col.key)}
                        onChange={() => toggleCol(col.key)}
                        style={{ width: 13, height: 13, cursor: 'pointer' }}
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        )}

        {error && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 7, fontSize: 12, color: '#b91c1c' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={doExport} disabled={exporting} style={{
            padding: '10px 24px', background: '#10b981', color: '#fff',
            border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14,
            opacity: exporting ? 0.7 : 1,
          }}>
            {exporting
              ? '⏳ Đang xuất...'
              : `📥 Xuất ${mode === 'all' ? EXPORT_COLUMNS.length : selectedCols.length} cột`}
          </button>
          <button onClick={onClose} style={{
            padding: '10px 16px', background: '#f1f5f9', border: 'none',
            borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#64748b'
          }}>Huỷ</button>
        </div>
      </div>
    </div>
  )
}

// ── Image Lightbox ─────────────────────────────────────────────────────────

function Lightbox({ url, onClose }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 3000, cursor: 'zoom-out',
      }}
      onClick={onClose}
    >
      <img
        src={url} alt=""
        style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 10, boxShadow: '0 24px 80px rgba(0,0,0,0.7)', cursor: 'default' }}
        onClick={e => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 20, right: 20,
          background: 'white', border: 'none', borderRadius: '50%',
          width: 40, height: 40, fontSize: 18, cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >✕</button>
    </div>
  )
}

// ── Cell renderer ──────────────────────────────────────────────────────────

function AssetCell({ colKey, asset, onImageClick }) {
  const td = (content, extra = {}) => (
    <td style={{ padding: '11px 14px', fontSize: 13, ...extra }}>{content}</td>
  )
  switch (colKey) {
    case 'anh':
      return (
        <td style={{ padding: '6px 10px', width: 52 }} onClick={e => e.stopPropagation()}>
          {asset.asset_image_url ? (
            <img
              src={`${IMG_HOST}${asset.asset_image_url}`}
              alt=""
              title="Click để xem lớn"
              style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0', cursor: 'zoom-in', transition: 'transform .15s' }}
              onClick={() => onImageClick(`${IMG_HOST}${asset.asset_image_url}`)}
              onMouseEnter={e => { e.target.style.transform = 'scale(1.15)' }}
              onMouseLeave={e => { e.target.style.transform = 'scale(1)' }}
              onError={e => { e.target.style.display = 'none' }}
            />
          ) : (
            <div style={{ width: 40, height: 40, borderRadius: 6, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#cbd5e1' }}>
              📷
            </div>
          )}
        </td>
      )
    case 'ma_ts':
      return (
        <td style={{ padding: '11px 14px' }}>
          <div style={{ fontWeight: 800, color: '#1a2744', fontSize: 13 }}>{asset.asset_code}</div>
          {asset.barcode && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{asset.barcode}</div>}
        </td>
      )
    case 'barcode':
      return td(asset.barcode || '—', { fontSize: 12, fontFamily: 'monospace', color: 'var(--muted)' })
    case 'ten_ts':
      return (
        <td style={{ padding: '11px 14px', maxWidth: 280 }}>
          <div style={{ fontWeight: 500 }}>{asset.name}</div>
        </td>
      )
    case 'loai_ts':
      return td(asset.asset_type_name || '—', { fontSize: 12, color: 'var(--muted)' })
    case 'trang_thai':
      return <td style={{ padding: '11px 14px' }}><StatusBadge status={asset.status} /></td>
    case 'vi_tri':
      return td(`📍 ${asset.location_name || '—'}`, { fontSize: 12, color: 'var(--muted)' })
    case 'phong_ban':
      return td(asset.department_name || '—', { fontSize: 12, color: 'var(--muted)' })
    case 'nguyen_gia':
      return td(fmtVnd(asset.original_value), { fontWeight: 700, textAlign: 'right' })
    case 'gia_tri_ht':
      return td(fmtVnd(asset.current_value), { textAlign: 'right', color: 'var(--muted)' })
    case 'khau_hao':
      return td(fmtVnd(asset.depreciation_value), { textAlign: 'right', color: 'var(--muted)' })
    case 'model_series':
      return td(asset.model_series || '—', { fontSize: 12, color: 'var(--muted)' })
    case 'so_luong':
      return td(asset.quantity, { textAlign: 'center' })
    case 'han_dk':
      return td(fmtDate(asset.registration_expiry), { fontSize: 12 })
    case 'nha_cung_cap':
      return td(asset.supplier_name || '—', { fontSize: 12, color: 'var(--muted)' })
    case 'so_khung':
      return td(asset.chassis_number || '—', { fontSize: 12, fontFamily: 'monospace' })
    case 'so_dong_co':
      return td(asset.engine_number || '—', { fontSize: 12, fontFamily: 'monospace' })
    case 'license_plate':
      return td(asset.license_plate || '—', { fontSize: 12, fontFamily: 'monospace', fontWeight: asset.license_plate ? 600 : 400 })
    case 'ngay_mua':
      return td(fmtDate(asset.purchase_date), { fontSize: 12 })
    default:
      // Dynamic attribute column: key starts with 'dyn_'
      if (colKey.startsWith('dyn_')) {
        const attrKey = colKey.slice(4)
        const val = asset.dynamic_attributes?.[attrKey]
        return td(val != null ? String(val) : '—', { fontSize: 12, color: 'var(--muted)' })
      }
      return td('—')
  }
}

// ── AssetsPage ─────────────────────────────────────────────────────────────

export default function AssetsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [groupCode, setGroupCode] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [visibleCols, setVisibleCols] = useState(getInitialCols)
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const [formModal, setFormModal] = useState(null) // null | 'new' | assetId
  const [sortBy, setSortBy] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [locationId, setLocationId] = useState('')

  const handleSort = (colSortKey) => {
    if (!colSortKey) return
    if (sortBy === colSortKey) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortBy(null); setSortDir('asc') }
    } else {
      setSortBy(colSortKey); setSortDir('asc')
    }
    setPage(1)
  }

  const { data, isLoading } = useQuery({
    queryKey: ['assets', q, status, groupCode, locationId, page, sortBy, sortDir],
    queryFn: () => assetApi.list({ q, status, group_code: groupCode, location_id: locationId || undefined, page, size: 20, sort_by: sortBy || undefined, sort_dir: sortBy ? sortDir : undefined }).then(r => r.data),
    keepPreviousData: true,
  })

  const { data: locationsList = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationApi.list().then(r => r.data),
  })

  const { data: assetTypes } = useQuery({
    queryKey: ['asset-types'],
    queryFn: () => assetTypeApi.list().then(r => r.data),
  })

  const { data: attrGroups } = useQuery({
    queryKey: ['asset-types-config'],
    queryFn: () => assetTypeGroupApi.list().then(r => r.data),
  })

  // Dynamic attribute columns (show_in_table = true), prefixed with 'dyn_' to avoid key collision
  const dynCols = (attrGroups || []).flatMap(g =>
    (g.attributes || [])
      .filter(a => a.show_in_table)
      .map(a => ({ key: `dyn_${a.field_key}`, label: a.field_label + (a.field_unit ? ` (${a.field_unit})` : '') }))
  ).filter((col, idx, arr) => arr.findIndex(c => c.key === col.key) === idx)

  const assets = data?.items || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / 20)

  const allCols = [...TABLE_COLUMNS, ...dynCols]
  const activeCols = allCols.filter(c => visibleCols.includes(c.key))

  const deleteMutation = useMutation({
    mutationFn: (id) => assetApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries(['assets']),
    onError: (e) => alert('Lỗi xoá: ' + (e.response?.data?.detail || e.message)),
  })

  const cloneMutation = useMutation({
    mutationFn: (id) => assetApi.duplicate(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['assets'])
      setFormModal(res.data.id)
    },
    onError: (e) => alert('Lỗi nhân bản: ' + (e.response?.data?.detail || e.message)),
  })

  const handleDelete = (e, asset) => {
    e.stopPropagation()
    if (window.confirm(`Xoá tài sản "${asset.asset_code} - ${asset.name}"?`)) {
      deleteMutation.mutate(asset.id)
    }
  }

  return (
    <div>
      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onDone={() => queryClient.invalidateQueries(['assets'])}
        />
      )}
      {showExport && (
        <ExportModal
          onClose={() => setShowExport(false)}
          currentFilters={{ status, group_code: groupCode }}
          visibleCols={visibleCols}
        />
      )}
      {formModal !== null && (
        <AssetFormModal
          assetId={formModal === 'new' ? null : formModal}
          onClose={() => setFormModal(null)}
          onSaved={() => queryClient.invalidateQueries(['assets'])}
        />
      )}

      <PageHeader
        title="📦 Danh sách tài sản"
        subtitle={`${total} tài sản trong hệ thống`}
        actions={
          <>
            <Btn variant="outline" onClick={() => setShowImport(true)}>
              📥 Import Excel
            </Btn>
            <Btn variant="outline" onClick={() => setShowExport(true)}>
              📤 Xuất Excel
            </Btn>
            <Btn variant="primary" onClick={() => setFormModal('new')}>
              + Thêm tài sản
            </Btn>
          </>
        }
      />

      <div className="page-padding" style={{ padding: 24 }}>
        {/* Filters + col picker */}
        <div className="filter-bar" style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={q} onChange={e => { setQ(e.target.value); setPage(1) }}
            placeholder="🔍 Tìm tên, mã TS, số khung, barcode..."
            style={{
              flex: 1, minWidth: 240, padding: '9px 14px', borderRadius: 8,
              border: '1px solid var(--border)', fontSize: 13
            }}
          />
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}
            style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'white' }}>
            <option value="">Tất cả trạng thái</option>
            <option value="PENDING_ALLOCATION">Chờ cấp phát</option>
            <option value="IN_USE">Đang sử dụng</option>
            <option value="IN_MAINTENANCE">Đang bảo trì</option>
            <option value="LIQUIDATED">Thanh lý</option>
          </select>
          <select value={groupCode} onChange={e => { setGroupCode(e.target.value); setPage(1) }}
            style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'white' }}>
            <option value="">Tất cả nhóm</option>
            {(assetTypes || []).map(g => (
              <option key={g.code} value={g.code}>{g.name}</option>
            ))}
          </select>
          <select value={locationId} onChange={e => { setLocationId(e.target.value); setPage(1) }}
            style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'white' }}>
            <option value="">Tất cả vị trí</option>
            {locationsList.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <ColPicker visible={visibleCols} onChange={setVisibleCols} dynCols={dynCols} />
        </div>

        {/* Table */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {isLoading ? <Spinner /> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    {activeCols.map(col => {
                      const isRight = col.key === 'nguyen_gia' || col.key === 'gia_tri_ht' || col.key === 'khau_hao'
                      const isSorted = col.sort && sortBy === col.sort
                      return (
                        <th key={col.key}
                          onClick={() => col.sort && handleSort(col.sort)}
                          style={{
                            padding: '10px 14px', textAlign: isRight ? 'right' : 'left',
                            fontSize: 11, fontWeight: 700,
                            color: isSorted ? '#1a2744' : 'var(--muted)',
                            borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                            cursor: col.sort ? 'pointer' : 'default',
                            userSelect: 'none',
                            background: isSorted ? '#f0f4ff' : undefined,
                          }}>
                          {col.label}
                          {col.sort && (
                            <span style={{ marginLeft: 4, fontSize: 10, opacity: isSorted ? 1 : 0.3 }}>
                              {isSorted ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                            </span>
                          )}
                        </th>
                      )
                    })}
                    <th style={{
                      padding: '10px 14px', fontSize: 11, fontWeight: 700,
                      color: 'var(--muted)', borderBottom: '1px solid var(--border)'
                    }}></th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map(a => (
                    <tr key={a.id}
                      onClick={() => navigate(`/assets/${a.id}`)}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {activeCols.map(col => (
                        <AssetCell key={col.key} colKey={col.key} asset={a} onImageClick={setLightboxUrl} />
                      ))}
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                        <Btn variant="ghost" size="sm"
                          onClick={e => { e.stopPropagation(); navigate(`/assets/${a.id}`) }}>
                          Chi tiết
                        </Btn>
                        <Btn variant="ghost" size="sm"
                          onClick={e => { e.stopPropagation(); setFormModal(a.id) }}
                          style={{ marginLeft: 4 }}>
                          ✏️
                        </Btn>
                        <Btn variant="ghost" size="sm"
                          onClick={e => { e.stopPropagation(); cloneMutation.mutate(a.id) }}
                          style={{ marginLeft: 4 }} title="Nhân bản tài sản">
                          📋
                        </Btn>
                        <Btn variant="ghost" size="sm"
                          onClick={e => handleDelete(e, a)}
                          style={{ marginLeft: 4, color: '#ef4444' }}>
                          🗑️
                        </Btn>
                      </td>
                    </tr>
                  ))}
                  {assets.length === 0 && (
                    <tr>
                      <td colSpan={activeCols.length + 1} style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                        Không tìm thấy tài sản nào
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div style={{
            padding: '12px 16px', borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12
          }}>
            <span style={{ color: 'var(--muted)' }}>
              Hiển thị {assets.length} / {total} tài sản
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <Btn variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Trước</Btn>
              <span style={{ padding: '4px 12px', background: 'var(--bg)', borderRadius: 6, fontSize: 12 }}>
                {page} / {totalPages || 1}
              </span>
              <Btn variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Sau →</Btn>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
