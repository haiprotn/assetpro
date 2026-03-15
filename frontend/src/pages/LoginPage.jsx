import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { login } = useAuthStore()
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    if (!username || !password) { setError('Vui lòng nhập đầy đủ thông tin'); return }
    setLoading(true)
    try {
      await login(username, password)
      navigate('/dashboard')
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Sai tên đăng nhập hoặc mật khẩu'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e3a6e 50%, #1a2744 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      {/* Background decoration */}
      <div style={{
        position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none',
      }}>
        <div style={{
          position: 'absolute', top: -100, right: -100, width: 400, height: 400,
          background: 'rgba(245,158,11,0.08)', borderRadius: '50%', filter: 'blur(60px)',
        }} />
        <div style={{
          position: 'absolute', bottom: -150, left: -100, width: 500, height: 500,
          background: 'rgba(59,130,246,0.08)', borderRadius: '50%', filter: 'blur(80px)',
        }} />
      </div>

      <div style={{
        background: 'rgba(255,255,255,0.98)', borderRadius: 20, padding: '44px 40px',
        width: 420, boxShadow: '0 25px 80px rgba(0,0,0,0.4)',
        position: 'relative', zIndex: 1,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 72, height: 72, background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            borderRadius: 20, margin: '0 auto 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36,
            boxShadow: '0 8px 24px rgba(245,158,11,0.35)',
          }}>🏗️</div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: -0.5 }}>AssetPro</h1>
          <p style={{ color: '#475569', fontSize: 13, marginTop: 5, fontWeight: 500 }}>Hệ thống Quản lý Tài sản</p>
          <div style={{
            display: 'inline-block', marginTop: 8,
            background: '#f1f5f9', borderRadius: 20, padding: '3px 12px',
            fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: 0.3
          }}>CÔNG TY TNHH ĐỒNG THUẬN HÀ</div>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Error message */}
          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
              padding: '10px 14px', fontSize: 13, color: '#dc2626', fontWeight: 500,
            }}>
              {error}
            </div>
          )}

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>
              Tên đăng nhập
            </label>
            <input
              type="text" value={username} onChange={e => { setUsername(e.target.value); setError('') }}
              placeholder="Nhập tên đăng nhập"
              autoComplete="username"
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 10,
                border: `1px solid ${error ? '#fca5a5' : '#e2e8f0'}`,
                fontSize: 14, outline: 'none', boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => e.target.style.borderColor = '#3b82f6'}
              onBlur={e => e.target.style.borderColor = error ? '#fca5a5' : '#e2e8f0'}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>
              Mật khẩu
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={password} onChange={e => { setPassword(e.target.value); setError('') }}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{
                  width: '100%', padding: '12px 44px 12px 14px', borderRadius: 10,
                  border: `1px solid ${error ? '#fca5a5' : '#e2e8f0'}`,
                  fontSize: 14, outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = '#3b82f6'}
                onBlur={e => e.target.style.borderColor = error ? '#fca5a5' : '#e2e8f0'}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: 4, fontSize: 16, color: '#94a3b8', lineHeight: 1,
                }}
              >
                {showPw ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} style={{
            marginTop: 4, padding: '13px 0',
            background: loading ? '#94a3b8' : 'linear-gradient(135deg, #1a2744, #2d4a8a)',
            color: 'white', border: 'none', borderRadius: 10, fontSize: 15,
            fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s', letterSpacing: 0.3,
            boxShadow: loading ? 'none' : '0 4px 14px rgba(26,39,68,0.4)',
          }}>
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 28, lineHeight: 1.6 }}>
          AssetPro v1.0 · FastAPI + PostgreSQL + React
        </p>
      </div>
    </div>
  )
}
