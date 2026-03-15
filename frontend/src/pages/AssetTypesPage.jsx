import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { assetTypeGroupApi } from '../services/api'
import { Card, PageHeader, Btn, Spinner } from '../components/ui'

const ALLOC_TYPES = [
  { value: 'RECOVERABLE', label: 'Cấp phát có thu hồi' },
  { value: 'CONSUMABLE',  label: 'Tài sản tiêu hao' },
  { value: 'FIXED',       label: 'Tài sản cố định' },
]
const GROUP_ICONS = ['🏗️','🚗','💻','🔧','📏','🖨️','❄️','📱','🔌','⚙️','🪑','📦']
const allocLabel = v => ALLOC_TYPES.find(t => t.value === v)?.label || v

const inp = { width: '100%', padding: '9px 12px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }

// ── GroupModal ────────────────────────────────────────────────────────────────
function GroupModal({ group, onClose, onSave }) {
  const [name,  setName]  = useState(group?.name || '')
  const [code,  setCode]  = useState(group?.code || '')
  const [alloc, setAlloc] = useState(group?.allocation_type || 'RECOVERABLE')
  const [unit,  setUnit]  = useState(group?.tracking_unit || '')
  const [icon,  setIcon]  = useState(group?.icon || '📦')
  const [color, setColor] = useState(group?.color || '#1a2744')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!name.trim()) { setErr('Vui lòng nhập tên nhóm'); return }
    setSaving(true); setErr('')
    try {
      const payload = { name, allocation_type: alloc, tracking_unit: unit || null, icon, color }
      if (group?.id) {
        await assetTypeGroupApi.update(group.id, payload)
      } else {
        await assetTypeGroupApi.create({ ...payload, code: code || undefined })
      }
      onSave()
    } catch (e) {
      setErr(e.response?.data?.detail || 'Lỗi lưu dữ liệu')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'white', borderRadius: 14, width: 480, padding: 28, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 20 }}>
          {group?.id ? 'Sửa nhóm loại TS' : 'Thêm nhóm loại TS'}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>Tên nhóm *</label>
            <input value={name} onChange={e => setName(e.target.value)} style={inp} placeholder="VD: XE MÁY CƠ GIỚI" />
          </div>
          {!group?.id && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>Mã (tự động nếu trống)</label>
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} style={inp} placeholder="XE_MAY" />
            </div>
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>Kiểu cấp phát</label>
          <select value={alloc} onChange={e => setAlloc(e.target.value)}
            style={{ ...inp, background: 'white' }}>
            {ALLOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>Đơn vị theo dõi</label>
          <input value={unit} onChange={e => setUnit(e.target.value)} style={inp} placeholder="VD: Giờ máy, Km..." />
        </div>

        <div style={{ marginBottom: 20, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>Icon</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {GROUP_ICONS.map(ic => (
                <span key={ic} onClick={() => setIcon(ic)} style={{
                  fontSize: 22, cursor: 'pointer', padding: 4, borderRadius: 6,
                  background: icon === ic ? '#e0f2fe' : 'transparent',
                  border: icon === ic ? '2px solid #0369a1' : '2px solid transparent',
                }}>{ic}</span>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>Màu</label>
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              style={{ width: 50, height: 38, border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer' }} />
          </div>
        </div>

        {err && <div style={{ color: '#b91c1c', fontSize: 12, marginBottom: 12, background: '#fef2f2', padding: '8px 10px', borderRadius: 6 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={submit} disabled={saving} style={{ padding: '9px 22px', background: '#1a2744', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
            {saving ? '...' : 'Lưu'}
          </button>
          <button onClick={onClose} style={{ padding: '9px 16px', background: '#f1f5f9', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13 }}>Huỷ</button>
        </div>
      </div>
    </div>
  )
}

// ── TypeModal ─────────────────────────────────────────────────────────────────
function TypeModal({ groupId, onClose, onSave }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!name.trim()) { setErr('Vui lòng nhập tên loại TS'); return }
    setSaving(true); setErr('')
    try {
      await assetTypeGroupApi.createType(groupId, { name, code: code || undefined })
      onSave()
    } catch (e) {
      setErr(e.response?.data?.detail || 'Lỗi lưu dữ liệu')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'white', borderRadius: 14, width: 400, padding: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Thêm loại tài sản</div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>Tên loại *</label>
          <input value={name} onChange={e => setName(e.target.value)} style={inp}
            onKeyDown={e => e.key === 'Enter' && submit()} autoFocus />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>Mã (tự động nếu trống)</label>
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} style={inp}
            onKeyDown={e => e.key === 'Enter' && submit()} />
        </div>
        {err && <div style={{ color: '#b91c1c', fontSize: 12, marginBottom: 10, background: '#fef2f2', padding: '7px 10px', borderRadius: 6 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={submit} disabled={saving} style={{ padding: '8px 20px', background: '#10b981', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
            {saving ? '...' : 'Thêm'}
          </button>
          <button onClick={onClose} style={{ padding: '8px 14px', background: '#f1f5f9', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13 }}>Huỷ</button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AssetTypesPage() {
  const qc = useQueryClient()
  const [groupModal, setGroupModal] = useState(null)   // null | {} | group object
  const [typeModal, setTypeModal]   = useState(null)   // null | groupId
  const [expanded, setExpanded]     = useState({})
  const [err, setErr] = useState('')

  // Two parallel queries — no hooks in loops
  const { data: groups = [], isLoading: loadingGroups } = useQuery({
    queryKey: ['asset-type-groups'],
    queryFn: () => assetTypeGroupApi.list().then(r => r.data),
  })

  const { data: flatTypes = [], isLoading: loadingTypes } = useQuery({
    queryKey: ['asset-types-flat'],
    queryFn: () => assetTypeGroupApi.listFlatTypes().then(r => r.data),
  })

  // Group types by group_id for O(1) lookup
  const typesByGroup = useMemo(() => {
    const map = {}
    for (const t of flatTypes) {
      const gid = String(t.group_id)
      if (!map[gid]) map[gid] = []
      map[gid].push(t)
    }
    return map
  }, [flatTypes])

  const toggleExpand = id => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  const invalidateAll = () => {
    qc.invalidateQueries(['asset-type-groups'])
    qc.invalidateQueries(['asset-types-flat'])
    qc.invalidateQueries(['asset-type-groups-flat'])
  }

  const handleDeleteGroup = async g => {
    if (!window.confirm(`Xóa nhóm "${g.name}"?`)) return
    setErr('')
    try {
      await assetTypeGroupApi.delete(g.id)
      invalidateAll()
    } catch (e) { setErr(e.response?.data?.detail || 'Lỗi xóa nhóm') }
  }

  const handleDeleteType = async (groupId, t) => {
    if (!window.confirm(`Xóa loại "${t.name}"?`)) return
    setErr('')
    try {
      await assetTypeGroupApi.deleteType(groupId, t.id)
      invalidateAll()
    } catch (e) { setErr(e.response?.data?.detail || 'Lỗi xóa loại') }
  }

  if (loadingGroups || loadingTypes) return <Spinner />

  return (
    <div>
      {groupModal !== null && (
        <GroupModal
          group={groupModal.id ? groupModal : undefined}
          onClose={() => setGroupModal(null)}
          onSave={() => { invalidateAll(); setGroupModal(null) }}
        />
      )}
      {typeModal && (
        <TypeModal
          groupId={typeModal}
          onClose={() => setTypeModal(null)}
          onSave={() => { invalidateAll(); setTypeModal(null) }}
        />
      )}

      <PageHeader
        title="Quản lý Loại tài sản"
        subtitle={`${groups.length} nhóm  •  ${flatTypes.length} loại`}
        actions={<Btn variant="primary" onClick={() => setGroupModal({})}>+ Thêm nhóm</Btn>}
      />

      <div style={{ padding: 24 }}>
        {err && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>
            {err}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {groups.length === 0 ? (
            <Card style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Chưa có nhóm loại tài sản. Nhấn "+ Thêm nhóm" để bắt đầu.
            </Card>
          ) : groups.map(g => {
            const gTypes = typesByGroup[String(g.id)] || []
            const isOpen = !!expanded[g.id]
            return (
              <Card key={g.id} style={{ padding: 0, overflow: 'hidden' }}>
                {/* Group header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px',
                  cursor: 'pointer', background: isOpen ? '#f8fafc' : 'white',
                  borderBottom: isOpen ? '1px solid var(--border)' : 'none',
                }} onClick={() => toggleExpand(g.id)}>

                  <div style={{
                    width: 38, height: 38, borderRadius: 9, fontSize: 20,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: g.color ? `${g.color}22` : '#e0f2fe', flexShrink: 0,
                  }}>{g.icon || '📦'}</div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{g.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {allocLabel(g.allocation_type)}
                      <span style={{ marginLeft: 8, color: '#10b981', fontWeight: 600 }}>{gTypes.length} loại</span>
                      {g.asset_count > 0 && <span style={{ marginLeft: 8 }}>{g.asset_count} tài sản</span>}
                      {g.tracking_unit && <span style={{ marginLeft: 8 }}>• {g.tracking_unit}</span>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}
                    onClick={e => e.stopPropagation()}>
                    <Btn variant="ghost" size="sm" onClick={() => setGroupModal(g)}>Sửa</Btn>
                    <Btn variant="ghost" size="sm" onClick={() => setTypeModal(g.id)}>+ Loại</Btn>
                    <button
                      disabled={g.asset_count > 0}
                      onClick={() => handleDeleteGroup(g)}
                      title={g.asset_count > 0 ? 'Đang có tài sản, không thể xóa' : 'Xóa nhóm'}
                      style={{
                        padding: '4px 9px', fontSize: 12, borderRadius: 6,
                        background: g.asset_count > 0 ? '#f1f5f9' : '#fef2f2',
                        color: g.asset_count > 0 ? '#cbd5e1' : '#b91c1c',
                        border: 'none', cursor: g.asset_count > 0 ? 'not-allowed' : 'pointer',
                      }}>Xóa</button>
                  </div>

                  <span style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 4 }}>
                    {isOpen ? '▲' : '▼'}
                  </span>
                </div>

                {/* Expanded: list of specific types */}
                {isOpen && (
                  <div>
                    {gTypes.length === 0 ? (
                      <div style={{ padding: '12px 20px', fontSize: 13, color: 'var(--muted)' }}>
                        Chưa có loại tài sản.{' '}
                        <span style={{ color: '#0369a1', cursor: 'pointer', textDecoration: 'underline' }}
                          onClick={() => setTypeModal(g.id)}>Thêm ngay</span>
                      </div>
                    ) : gTypes.map((t, i) => (
                      <div key={t.id} style={{
                        display: 'flex', alignItems: 'center', padding: '8px 18px 8px 30px',
                        borderBottom: i < gTypes.length - 1 ? '1px solid #f8fafc' : 'none',
                        gap: 12,
                      }}>
                        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#94a3b8', width: 160, flexShrink: 0 }}>{t.code}</span>
                        <span style={{ flex: 1, fontSize: 13 }}>{t.name}</span>
                        <span style={{
                          padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, flexShrink: 0,
                          background: t.asset_count > 0 ? '#dcfce7' : '#f1f5f9',
                          color: t.asset_count > 0 ? '#15803d' : '#94a3b8',
                        }}>{t.asset_count || 0} TS</span>
                        <button
                          disabled={t.asset_count > 0}
                          onClick={() => handleDeleteType(g.id, t)}
                          title={t.asset_count > 0 ? 'Đang có tài sản' : 'Xóa loại'}
                          style={{
                            padding: '3px 8px', fontSize: 11, borderRadius: 5, flexShrink: 0,
                            background: t.asset_count > 0 ? '#f1f5f9' : '#fef2f2',
                            color: t.asset_count > 0 ? '#cbd5e1' : '#ef4444',
                            border: 'none', cursor: t.asset_count > 0 ? 'not-allowed' : 'pointer',
                          }}>Xóa</button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
