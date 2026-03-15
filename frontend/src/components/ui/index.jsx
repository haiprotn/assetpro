// ── Shared UI primitives ────────────────────────────────────

export const Card = ({ children, style = {}, className = '' }) => (
  <div className={className} style={{
    background: 'var(--card)', borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow)', padding: 20, ...style
  }}>{children}</div>
)

export const PageHeader = ({ title, subtitle, actions }) => (
  <div className="page-header-row" style={{
    background: 'white', borderBottom: '1px solid var(--border)',
    padding: '14px 24px', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50,
    flexWrap: 'wrap', gap: 10,
  }}>
    <div>
      <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{title}</h1>
      {subtitle && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{subtitle}</div>}
    </div>
    {actions && (
      <div className="page-header-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {actions}
      </div>
    )}
  </div>
)

export const Btn = ({ children, variant = 'primary', size = 'md', onClick, style = {}, disabled = false }) => {
  const base = {
    borderRadius: 8, border: 'none', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1, transition: 'all 0.15s', fontFamily: 'inherit',
    padding: size === 'sm' ? '6px 12px' : size === 'lg' ? '11px 22px' : '8px 18px',
    fontSize: size === 'sm' ? 12 : 14,
  }
  const variants = {
    primary:  { background: 'var(--primary)', color: 'white' },
    accent:   { background: 'var(--accent)', color: 'white' },
    ghost:    { background: 'var(--primary)12', color: 'var(--primary)', border: '1px solid var(--primary)30' },
    danger:   { background: 'var(--danger)', color: 'white' },
    outline:  { background: 'white', color: 'var(--text)', border: '1px solid var(--border)' },
  }
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  )
}

const STATUS_MAP = {
  // ── Trạng thái tài sản ───────────────────────────────────
  AVAILABLE:          { bg: '#dcfce7', color: '#16a34a', label: 'Sẵn sàng' },
  IN_USE:             { bg: '#dbeafe', color: '#1d4ed8', label: 'Đang sử dụng' },
  UNDER_MAINTENANCE:  { bg: '#ffedd5', color: '#c2410c', label: 'Đang bảo trì' },
  IN_MAINTENANCE:     { bg: '#ffedd5', color: '#c2410c', label: 'Đang bảo trì' },
  STORED:             { bg: '#f1f5f9', color: '#475569', label: 'Đang lưu kho' },
  DAMAGED:            { bg: '#fef2f2', color: '#dc2626', label: 'Hỏng hóc' },
  BROKEN:             { bg: '#fef2f2', color: '#dc2626', label: 'Hỏng hóc' },
  LOST:               { bg: '#fef2f2', color: '#b91c1c', label: 'Mất / Thất lạc' },
  LIQUIDATED:         { bg: '#fee2e2', color: '#b91c1c', label: 'Đã thanh lý' },
  RECOVERED:          { bg: '#f0fdf4', color: '#15803d', label: 'Đã thu hồi' },
  ALLOCATED:          { bg: '#ede9fe', color: '#7c3aed', label: 'Đã cấp phát' },
  PENDING_ALLOCATION: { bg: '#fef9c3', color: '#ca8a04', label: 'Chờ cấp phát' },
  RETIRED:            { bg: '#f1f5f9', color: '#64748b', label: 'Ngừng sử dụng' },
  // ── Trạng thái phiếu điều chuyển ────────────────────────
  DRAFT:              { bg: '#f8fafc', color: '#64748b', label: 'Nháp' },
  PENDING_APPROVAL:   { bg: '#fef9c3', color: '#ca8a04', label: 'Chờ duyệt' },
  APPROVED:           { bg: '#ede9fe', color: '#7c3aed', label: 'Đã duyệt' },
  IN_TRANSIT:         { bg: '#dbeafe', color: '#1d4ed8', label: 'Đang vận chuyển' },
  PENDING_QR_CONFIRM: { bg: '#fef3c7', color: '#d97706', label: 'Chờ xác nhận QR' },
  COMPLETED:          { bg: '#dcfce7', color: '#15803d', label: 'Hoàn thành' },
  REJECTED:           { bg: '#fef2f2', color: '#dc2626', label: 'Từ chối' },
  CANCELLED:          { bg: '#f1f5f9', color: '#475569', label: 'Đã huỷ' },
  // ── Trạng thái bảo trì ──────────────────────────────────
  PENDING:            { bg: '#fef9c3', color: '#ca8a04', label: 'Chờ xử lý' },
  IN_PROGRESS:        { bg: '#dbeafe', color: '#1d4ed8', label: 'Đang thực hiện' },
  // ── Giá trị tiếng Việt (backward compat) ────────────────
  'Đang sử dụng': { bg: '#dbeafe', color: '#1d4ed8', label: 'Đang sử dụng' },
  'Chờ cấp phát': { bg: '#fef9c3', color: '#ca8a04', label: 'Chờ cấp phát' },
  'Sẵn sàng':     { bg: '#dcfce7', color: '#16a34a', label: 'Sẵn sàng' },
  'Đã huỷ':       { bg: '#f1f5f9', color: '#475569', label: 'Đã huỷ' },
}

export const StatusBadge = ({ status }) => {
  const s = STATUS_MAP[status] || { bg: '#f1f5f9', color: '#475569', label: status }
  return (
    <span style={{
      background: s.bg, color: s.color, padding: '2px 10px',
      borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap'
    }}>{s.label}</span>
  )
}

export const Input = ({ label, ...props }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
    {label && <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{label}</label>}
    <input style={{
      padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)',
      fontSize: 13, background: 'white', ...props.style
    }} {...props} />
  </div>
)

export const Select = ({ label, children, ...props }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
    {label && <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{label}</label>}
    <select style={{
      padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)',
      fontSize: 13, background: 'white', ...props.style
    }} {...props}>{children}</select>
  </div>
)

export const Table = ({ columns, data, onRowClick }) => (
  <div style={{ overflowX: 'auto' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ background: 'var(--bg)' }}>
          {columns.map(col => (
            <th key={col.key} style={{
              padding: '10px 14px', textAlign: 'left', fontSize: 12,
              fontWeight: 700, color: 'var(--muted)',
              borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap'
            }}>{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={i}
            onClick={() => onRowClick?.(row)}
            style={{
              borderBottom: '1px solid var(--border)',
              cursor: onRowClick ? 'pointer' : 'default',
              transition: 'background 0.1s'
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            {columns.map(col => (
              <td key={col.key} style={{ padding: '11px 14px', ...col.style }}>
                {col.render ? col.render(row[col.key], row) : row[col.key]}
              </td>
            ))}
          </tr>
        ))}
        {data.length === 0 && (
          <tr><td colSpan={columns.length} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
            Không có dữ liệu
          </td></tr>
        )}
      </tbody>
    </table>
  </div>
)

export const fmtVnd = (v) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v || 0)

export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('vi-VN') : '—'

export const Spinner = () => (
  <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
    <div style={{
      width: 32, height: 32, border: '3px solid var(--border)',
      borderTopColor: 'var(--primary)', borderRadius: '50%',
      animation: 'spin 0.7s linear infinite'
    }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
)

export const DynAttrBadges = ({ attrs = {} }) => {
  if (!attrs || !Object.keys(attrs).length) return null
  const META = {
    gio_may:               { icon: '⏱️', label: 'Giờ máy', unit: 'h' },
    han_hieu_chuan:        { icon: '📅', label: 'Hiệu chuẩn' },
    han_dang_kiem:         { icon: '📋', label: 'Đăng kiểm' },
    so_khung:              { icon: '🔢', label: 'Số khung' },
    tinh_trang_the_chap:   { icon: '🏦', label: 'Thế chấp' },
    do_chinh_xac:          { icon: '📐', label: 'Chính xác' },
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
      {Object.entries(attrs).map(([k, v]) => {
        const meta = META[k] || { icon: '•', label: k }
        const expired = (k.startsWith('han_') || k.includes('chuan')) && typeof v === 'string' && v !== 'HẾT HẠN'
          ? new Date(v) < new Date() : v === 'HẾT HẠN'
        return (
          <span key={k} style={{
            background: expired ? '#fef2f2' : '#f0f9ff',
            color: expired ? '#dc2626' : '#0369a1',
            border: `1px solid ${expired ? '#fecaca' : '#bae6fd'}`,
            borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 600
          }}>
            {meta.icon} {meta.label}: {v}{meta.unit ? ' ' + meta.unit : ''}
          </span>
        )
      })}
    </div>
  )
}
