import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { assetApi } from '../services/api'

const STATUS_VI = {
  IN_USE: 'Đang sử dụng',
  PENDING_ALLOCATION: 'Chờ cấp phát',
  IN_MAINTENANCE: 'Đang bảo trì',
  LIQUIDATED: 'Thanh lý',
  CANCELLED: 'Đã hủy',
}

export default function TrashPage() {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['trash'],
    queryFn: () => assetApi.trash().then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => assetApi.permanentDelete(id),
    onSuccess: () => queryClient.invalidateQueries(['trash']),
    onError: (e) => alert('Lỗi: ' + (e.response?.data?.detail || e.message)),
  })

  const handleDelete = (asset) => {
    if (!window.confirm(`Xóa vĩnh viễn "${asset.asset_code} - ${asset.name}"?\n\nHành động này KHÔNG THỂ hoàn tác.`)) return
    deleteMutation.mutate(asset.id)
  }

  const handleDeleteSelected = () => {
    if (selected.size === 0) return
    if (!window.confirm(`Xóa vĩnh viễn ${selected.size} tài sản đã chọn?\n\nHành động này KHÔNG THỂ hoàn tác.`)) return
    Promise.all([...selected].map(id => assetApi.permanentDelete(id)))
      .then(() => { queryClient.invalidateQueries(['trash']); setSelected(new Set()) })
      .catch(e => alert('Lỗi: ' + (e.response?.data?.detail || e.message)))
  }

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (!data) return
    if (selected.size === data.length) setSelected(new Set())
    else setSelected(new Set(data.map(a => a.id)))
  }

  const th = { padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 13, color: '#475569', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }
  const td = { padding: '10px 12px', fontSize: 13, color: '#1e293b', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>🗑️ Thùng rác</h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
            Tài sản đã xóa mềm — xóa vĩnh viễn để giải phóng mã
          </p>
        </div>
        {selected.size > 0 && (
          <button
            onClick={handleDeleteSelected}
            disabled={deleteMutation.isPending}
            style={{
              background: '#ef4444', color: 'white', border: 'none',
              borderRadius: 8, padding: '8px 18px', fontSize: 13,
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            Xóa {selected.size} mục đã chọn
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Đang tải...</div>
        ) : !data || data.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
            <div style={{ fontWeight: 600 }}>Thùng rác trống</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Không có tài sản nào đã xóa</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f8fafc' }}>
              <tr>
                <th style={{ ...th, width: 40 }}>
                  <input type="checkbox"
                    checked={selected.size === data.length && data.length > 0}
                    onChange={toggleAll} />
                </th>
                <th style={th}>Mã TS</th>
                <th style={th}>Tên tài sản</th>
                <th style={th}>Trạng thái cũ</th>
                <th style={{ ...th, width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {data.map(asset => (
                <tr key={asset.id} style={{ background: selected.has(asset.id) ? '#fef2f2' : 'white' }}>
                  <td style={td}>
                    <input type="checkbox"
                      checked={selected.has(asset.id)}
                      onChange={() => toggleSelect(asset.id)} />
                  </td>
                  <td style={td}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#dc2626' }}>{asset.asset_code}</span>
                  </td>
                  <td style={td}>{asset.name}</td>
                  <td style={td}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px',
                      borderRadius: 20, background: '#f1f5f9', color: '#475569'
                    }}>
                      {STATUS_VI[asset.status] || asset.status}
                    </span>
                  </td>
                  <td style={td}>
                    <button
                      onClick={() => handleDelete(asset)}
                      disabled={deleteMutation.isPending}
                      style={{
                        background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5',
                        borderRadius: 6, padding: '5px 12px', fontSize: 12,
                        fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      Xóa vĩnh viễn
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data && data.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>
          Tổng {data.length} tài sản trong thùng rác
        </div>
      )}
    </div>
  )
}
