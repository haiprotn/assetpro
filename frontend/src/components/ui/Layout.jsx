import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

const NAV = [
  { to: '/dashboard',   icon: '📊', label: 'Tổng quan' },
  { to: '/assets',      icon: '📦', label: 'Tài sản' },
  { to: '/transfers',   icon: '🔄', label: 'Điều chuyển' },
  { to: '/maintenance', icon: '🔧', label: 'Bảo trì' },
  { to: '/lifecycle',   icon: '📜', label: 'Lịch sử' },
  { separator: true },
  { to: '/locations',   icon: '📍', label: 'Vị trí' },
  { to: '/departments', icon: '🏢', label: 'Phòng ban' },
  { to: '/asset-types', icon: '🏷️', label: 'Loại tài sản' },
  { to: '/config',      icon: '⚙️', label: 'Cấu hình' },
  { separator: true },
  { to: '/trash',       icon: '🗑️', label: 'Thùng rác' },
]

const ROLE_LABEL = {
  SUPER_ADMIN: 'Quản trị hệ thống', ADMIN: 'Quản trị viên',
  MANAGER: 'Quản lý', OPERATOR: 'Vận hành', STAFF: 'Nhân viên', VIEWER: 'Xem',
}

export default function Layout() {
  const { logout, user } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Close sidebar on route change (mobile)
  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  // Close sidebar on ESC
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setSidebarOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>

      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            display: 'none',
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 99,
          }}
          className="mobile-backdrop"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`app-sidebar${sidebarOpen ? ' sidebar-open' : ''}`}
        style={{
          width: 220, background: 'var(--primary)', display: 'flex',
          flexDirection: 'column', flexShrink: 0,
          position: 'sticky', top: 0, height: '100vh',
        }}
      >
        {/* Logo */}
        <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img
              src="/logo-dth.svg"
              alt="Đồng Thuận Hà"
              style={{ width: 44, height: 48, objectFit: 'contain', flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'white', fontWeight: 800, fontSize: 15, lineHeight: 1.1 }}>AssetPro</div>
              <div style={{ color: '#F5C518', fontSize: 9.5, fontWeight: 700, marginTop: 2, letterSpacing: 0.3, lineHeight: 1.2 }}>ĐỒNG THUẬN HÀ</div>
            </div>
            {/* Close button (mobile only) */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="sidebar-close-btn"
              style={{
                display: 'none',
                background: 'rgba(255,255,255,0.1)', border: 'none',
                color: 'white', borderRadius: 6, padding: '4px 8px',
                fontSize: 18, cursor: 'pointer',
              }}
            >×</button>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '10px 8px', flex: 1, overflowY: 'auto' }}>
          {NAV.map((item, i) =>
            item.separator ? (
              <div key={`sep-${i}`} style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '6px 4px' }} />
            ) : (
              <NavLink key={item.to} to={item.to} style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 8, marginBottom: 2,
                color: isActive ? 'white' : 'rgba(255,255,255,0.55)',
                background: isActive ? 'rgba(255,255,255,0.14)' : 'transparent',
                fontWeight: isActive ? 700 : 400, fontSize: 13,
                transition: 'all 0.15s',
              })}>
                <span style={{ fontSize: 15 }}>{item.icon}</span>
                {item.label}
              </NavLink>
            )
          )}
        </nav>

        {/* User */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{
              width: 30, height: 30, background: 'rgba(255,255,255,0.15)', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13
            }}>👤</div>
            <div>
              <div style={{ color: 'white', fontSize: 12, fontWeight: 600 }}>{user?.username || 'Người dùng'}</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>{ROLE_LABEL[user?.role] || user?.role || ''}</div>
            </div>
          </div>
          <button onClick={handleLogout} style={{
            width: '100%', padding: '7px 0', borderRadius: 6,
            background: 'rgba(255,255,255,0.08)', border: 'none',
            color: 'rgba(255,255,255,0.6)', fontSize: 12, cursor: 'pointer'
          }}>Đăng xuất</button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        {/* Mobile topbar */}
        <div className="mobile-topbar" style={{
          display: 'none',
          alignItems: 'center', gap: 12,
          padding: '12px 16px',
          background: 'var(--primary)',
          position: 'sticky', top: 0, zIndex: 50,
        }}>
          <button
            onClick={() => setSidebarOpen(true)}
            style={{
              background: 'rgba(255,255,255,0.15)', border: 'none',
              color: 'white', borderRadius: 8, padding: '6px 10px',
              fontSize: 18, cursor: 'pointer', lineHeight: 1,
            }}
          >☰</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src="/logo-dth.svg" alt="DTH" style={{ width: 28, height: 30, objectFit: 'contain' }} />
            <span style={{ color: 'white', fontWeight: 800, fontSize: 15 }}>AssetPro</span>
          </div>
        </div>

        <Outlet />
      </main>
    </div>
  )
}
