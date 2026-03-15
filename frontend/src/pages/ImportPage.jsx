import { useState, useRef } from 'react'
import axios from 'axios'
import { Card, PageHeader } from '../components/ui'

const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001/api/v1'
const api = axios.create({ baseURL: BASE, timeout: 180000 })
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('access_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

export default function ImportPage() {
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
      const res = await api.post('/data/import/preview', fd)
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
      const res = await api.post('/data/import/execute', fd)
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
    <div>
      <PageHeader
        title="📥 Import Tài sản từ Excel"
        subtitle="Nhập dữ liệu từ phần mềm cũ — hỗ trợ file .xlsx có ảnh nhúng trực tiếp"
      />
      <div style={{ padding: 24, maxWidth: 860 }}>

        {/* Bước 1: Chọn file */}
        <Card style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, color: 'var(--primary)' }}>
            📁 Bước 1 — Chọn file Excel
          </div>

          <div
            onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current.click()}
            style={{
              border: `2px dashed ${file ? '#10b981' : '#cbd5e1'}`,
              borderRadius: 12, padding: '32px 20px', textAlign: 'center',
              cursor: 'pointer', background: file ? '#f0fdf4' : '#f8fafc',
              transition: 'all .2s',
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 8 }}>{file ? '✅' : '📂'}</div>
            {file ? (
              <>
                <div style={{ fontWeight: 700, color: '#10b981', fontSize: 15 }}>{file.name}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  {(file.size / 1024 / 1024).toFixed(1)} MB — click để đổi file
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 600, color: '#475569' }}>Kéo thả hoặc click để chọn file</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  Hỗ trợ .xlsx — cả file có ảnh nhúng và không có ảnh
                </div>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />

          {file && (
            <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
              <button onClick={doPreview} disabled={step === 'previewing'} style={{
                padding: '9px 20px', background: '#1a2744', color: '#fff',
                border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14
              }}>
                {step === 'previewing' ? '⏳ Đang đọc...' : '🔍 Xem trước'}
              </button>
              <button onClick={reset} style={{
                padding: '9px 16px', background: '#f1f5f9', color: '#64748b',
                border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14
              }}>🗑️ Xoá</button>
            </div>
          )}
        </Card>

        {/* Bước 2: Preview */}
        {preview && step !== 'done' && (
          <Card style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, color: 'var(--primary)' }}>
              🔍 Bước 2 — Xem trước dữ liệu
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
              {[
                { label: 'Bản ghi', value: preview.total_rows, color: '#1a2744', bg: '#e0e7ff' },
                { label: 'Ảnh nhúng', value: preview.embedded_images, color: preview.embedded_images > 0 ? '#7c3aed' : '#94a3b8', bg: preview.embedded_images > 0 ? '#ede9fe' : '#f1f5f9', icon: preview.embedded_images > 0 ? '🖼️' : '—' },
                { label: 'Số cột', value: preview.columns, color: '#0369a1', bg: '#e0f2fe' },
              ].map(s => (
                <div key={s.label} style={{ padding: '14px 22px', background: s.bg, borderRadius: 10, minWidth: 130 }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>
                    {s.icon && s.icon !== '—' ? s.icon + ' ' : ''}{s.value}
                  </div>
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Thông báo ảnh */}
            {preview.embedded_images > 0 && (
              <div style={{
                padding: '10px 14px', background: '#ede9fe', borderRadius: 8,
                fontSize: 13, color: '#5b21b6', marginBottom: 14, fontWeight: 500
              }}>
                🖼️ Phát hiện <strong>{preview.embedded_images} ảnh</strong> nhúng trong file —
                sẽ được tự động extract và lưu cùng lúc import dữ liệu.
              </div>
            )}

            {/* Sample table */}
            <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>5 bản ghi đầu:</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#1a2744', color: '#fff' }}>
                    {['Mã TS', 'Tên tài sản', 'Trạng thái', 'Vị trí', 'Nguyên giá', 'Ảnh'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.samples.map((s, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #e2e8f0', background: i % 2 ? '#f8fafc' : '#fff' }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#1a2744', fontWeight: 700 }}>{s.ma_ts}</td>
                      <td style={{ padding: '8px 12px' }}>{s.ten_ts}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                          background: s.trang_thai === 'Đang sử dụng' ? '#dcfce7' : '#fef3c7',
                          color: s.trang_thai === 'Đang sử dụng' ? '#15803d' : '#b45309',
                        }}>{s.trang_thai}</span>
                      </td>
                      <td style={{ padding: '8px 12px', color: '#64748b', fontSize: 12 }}>{s.vi_tri || '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        {s.nguyen_gia ? Number(s.nguyen_gia).toLocaleString('vi-VN') + ' ₫' : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        {s.has_image ? '🖼️' : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 16, padding: '10px 14px', background: '#fef3c7', borderRadius: 8, fontSize: 13, color: '#92400e' }}>
              ⚠️ Tài sản có Mã TS đã tồn tại sẽ bị bỏ qua (không ghi đè).
            </div>

            <div style={{ marginTop: 14 }}>
              <button onClick={doImport} style={{
                padding: '11px 28px', background: '#10b981', color: '#fff',
                border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 15
              }}>
                🚀 Bắt đầu Import {preview.total_rows} bản ghi
                {preview.embedded_images > 0 && ` + ${preview.embedded_images} ảnh`}
              </button>
            </div>
          </Card>
        )}

        {/* Đang import */}
        {step === 'importing' && (
          <Card style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: '#f59e0b' }}>
              ⏳ Đang import dữ liệu và ảnh...
            </div>
            <div style={{ background: '#e2e8f0', borderRadius: 999, height: 14, overflow: 'hidden', marginBottom: 10 }}>
              <div style={{
                height: '100%', background: 'linear-gradient(90deg, #1a2744, #10b981)',
                borderRadius: 999, width: `${progress}%`, transition: 'width .5s ease'
              }} />
            </div>
            <div style={{ fontSize: 13, color: '#64748b' }}>{msg} ({progress}%)</div>
          </Card>
        )}

        {/* Kết quả */}
        {result && step === 'done' && (
          <Card style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16, color: '#10b981' }}>
              ✅ Import hoàn tất!
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              {[
                { label: 'Tài sản import', value: result.imported, color: '#15803d', bg: '#dcfce7' },
                { label: 'Ảnh đã lưu', value: result.images_saved, color: '#5b21b6', bg: '#ede9fe' },
                { label: 'Bỏ qua (trùng)', value: result.skipped, color: '#b45309', bg: '#fef3c7' },
                { label: 'Lỗi', value: result.errors?.length || 0, color: '#b91c1c', bg: '#fee2e2' },
              ].map(s => (
                <div key={s.label} style={{ padding: '14px 20px', background: s.bg, borderRadius: 10, minWidth: 120 }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ padding: '12px 16px', background: '#f0fdf4', borderRadius: 8, fontSize: 14, color: '#15803d', fontWeight: 600, marginBottom: 14 }}>
              {result.message}
            </div>

            {result.errors?.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#b91c1c', marginBottom: 6 }}>
                  ⚠️ Lỗi ({result.errors.length}):
                </div>
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12, maxHeight: 160, overflowY: 'auto' }}>
                  {result.errors.map((e, i) => (
                    <div key={i} style={{ fontSize: 12, fontFamily: 'monospace', color: '#7f1d1d', marginBottom: 4 }}>{e}</div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => window.location.href = '/assets'} style={{
                padding: '10px 20px', background: '#1a2744', color: '#fff',
                border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600
              }}>📦 Xem danh sách tài sản</button>
              <button onClick={reset} style={{
                padding: '10px 16px', background: '#f1f5f9', color: '#64748b',
                border: 'none', borderRadius: 8, cursor: 'pointer'
              }}>🔄 Import file khác</button>
            </div>
          </Card>
        )}

        {/* Lỗi */}
        {step === 'error' && (
          <Card style={{ marginBottom: 20 }}>
            <div style={{ color: '#b91c1c', fontWeight: 700, marginBottom: 8 }}>❌ Có lỗi xảy ra</div>
            <div style={{ fontSize: 13, color: '#7f1d1d', background: '#fef2f2', padding: 12, borderRadius: 8, marginBottom: 12 }}>{msg}</div>
            <button onClick={() => setStep('idle')} style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer' }}>← Thử lại</button>
          </Card>
        )}

        {/* Hướng dẫn */}
        {step === 'idle' && !preview && (
          <Card>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: 'var(--primary)' }}>📋 Hướng dẫn</div>
            <div style={{ fontSize: 13, color: '#475569', lineHeight: 2 }}>
              <div>✅ <strong>Hỗ trợ file có ảnh nhúng:</strong> Ảnh được tự động extract và lưu vào server</div>
              <div>✅ <strong>Hỗ trợ file không có ảnh:</strong> Import dữ liệu bình thường</div>
              <div>✅ <strong>Tự động tạo:</strong> Vị trí, Phòng ban, Nhà cung cấp, Loại tài sản nếu chưa có</div>
              <div>✅ <strong>Bỏ qua trùng:</strong> Mã TS đã tồn tại sẽ không bị ghi đè</div>
              <div>✅ <strong>Ảnh lưu vĩnh viễn:</strong> Trong Docker volume, không mất khi restart</div>
              <div>⚠️ <strong>File cần có cột:</strong> <code>Mã TS</code>, <code>Tên tài sản</code>, <code>Trạng thái</code></div>
            </div>
          </Card>
        )}

      </div>
    </div>
  )
}
