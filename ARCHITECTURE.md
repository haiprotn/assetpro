# HỆ THỐNG QUẢN LÝ TÀI SẢN ĐA LOẠI HÌNH
## Tài liệu Thiết kế Kiến trúc - Multi-type Asset Management System

---

## 1. TỔNG QUAN HỆ THỐNG

Được thiết kế dựa trên dữ liệu thực tế 962 tài sản của **Công ty TNHH Đồng Thuận Hà**, 
trải rộng 15+ công trường từ Tây Ninh → Quảng Ninh → Ninh Thuận.

### Vấn đề được giải quyết:
- **962 tài sản** thuộc nhiều loại hình khác nhau, mỗi loại cần theo dõi thông số khác nhau
- **Điều chuyển tài sản** giữa 15+ công trường cần xác thực đầu - cuối
- **Không có audit trail** → mất khả năng truy vết lịch sử

---

## 2. KIẾN TRÚC HỆ THỐNG

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                            │
│  React SPA (Vite)  │  Mobile PWA  │  QR Scanner App        │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTPS / REST
┌────────────────────▼────────────────────────────────────────┐
│                   NGINX (Reverse Proxy / SSL)               │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│              FastAPI Backend (Python 3.12)                  │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ Assets API   │  │ Transfers API│  │  Analytics API  │  │
│  │ /assets      │  │ /transfers   │  │  /dashboard     │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  QR API      │  │Maintenance   │  │  Lifecycle API  │  │
│  │ /qr          │  │ /maintenance │  │  /lifecycle     │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Service Layer                          │   │
│  │  AssetService  TransferService  MaintenanceService  │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────┬──────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│                  DATA LAYER                                 │
│  PostgreSQL 16  │  Redis 7 (cache)  │  MinIO (files)       │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. CẤU TRÚC DATABASE

### 3.1 Bảng cốt lõi

| Bảng | Mục đích | Ghi chú |
|------|----------|---------|
| `legal_entities` | Pháp nhân sở hữu | Công ty TNHH Đồng Thuận Hà |
| `departments` | Phòng ban / Ban dự án | Cây phân cấp (self-ref) |
| `locations` | Vị trí / Công trường | 15+ công trường thực tế |
| `asset_type_groups` | Nhóm loại tài sản | Có thuộc tính động riêng |
| `attribute_definitions` | Định nghĩa thuộc tính | Per-group dynamic schema |
| `asset_types` | Loại tài sản cụ thể | XE MÁY CƠ GIỚI, RTK... |
| `assets` | Tài sản | Bảng trung tâm |
| `transfer_orders` | Phiếu điều chuyển | Có QR token |
| `transfer_order_items` | Chi tiết phiếu | Per-item QR confirm |
| `asset_lifecycle_events` | Audit trail | Insert-only, immutable |
| `maintenance_records` | Hồ sơ bảo trì | Đọc đồng hồ trước/sau |

### 3.2 Thuộc tính động (Dynamic Attributes)

Lưu trữ dưới dạng JSONB trong cột `dynamic_attributes`:

```json
// Xe máy cơ giới (MRN1)
{
  "gio_may": 1500,
  "han_dang_kiem": "2026-06-30",
  "tinh_trang_the_chap": "THẾ CHẤP BIDV"
}

// Thiết bị đo đạc (RTK5)
{
  "han_hieu_chuan": "2026-12-15",
  "so_chung_chi_hieu_chuan": "HC-2024-0089",
  "do_chinh_xac": "2mm"
}

// Công cụ dụng cụ (theo dõi số lượng - không cần attr động)
{}
```

**Validation**: Khi create/update asset, hệ thống lookup `attribute_definitions` 
của group tương ứng và validate từng field (required, type, range, select options).

---

## 4. API ENDPOINTS

### Assets
```
GET    /api/v1/assets                    List + search + filter
POST   /api/v1/assets                    Tạo tài sản mới (validate dynamic attrs)
GET    /api/v1/assets/{id}               Chi tiết
PUT    /api/v1/assets/{id}               Cập nhật
GET    /api/v1/assets/code/{code}        Lookup bằng Mã TS
GET    /api/v1/assets/{id}/qr-image      Xuất ảnh QR (PNG)
GET    /api/v1/assets/{id}/lifecycle     Lịch sử vòng đời
GET    /api/v1/assets/alerts             Cảnh báo hạn đăng kiểm, hiệu chuẩn
GET    /api/v1/assets/export             Xuất Excel (format 1Office)
POST   /api/v1/assets/{id}/attachments   Upload file đính kèm
```

### Transfers (Luồng phức tạp)
```
POST   /api/v1/transfers                 Tạo phiếu (DRAFT)
POST   /api/v1/transfers/{id}/submit     Trình duyệt
POST   /api/v1/transfers/{id}/approve    Phê duyệt (MANAGER)
POST   /api/v1/transfers/{id}/reject     Từ chối (kèm lý do)
POST   /api/v1/transfers/{id}/dispatch   Xuất tài sản → IN_TRANSIT
POST   /api/v1/transfers/{id}/verify-qr  ✅ Xác nhận QR tại đích
GET    /api/v1/transfers/qr-lookup/{tok} Tra cứu phiếu bằng QR token (public)
```

### QR Verification Flow
```
POST   /api/v1/qr/scan                   Scan QR → return asset/transfer info
GET    /api/v1/qr/asset/{asset_id}       Generate QR image cho label in
```

---

## 5. LUỒNG ĐIỀU CHUYỂN VỚI XÁC THỰC QR

```
[Người giao]                        [Người nhận tại công trường]

1. Tạo phiếu DC-2026-0023           
   (Chọn tài sản + điểm đến)
   
2. Trình duyệt → Manager phê duyệt

3. Xuất tài sản                      
   → Hệ thống sinh QR Token           
   → Gửi token qua SMS/email         
                                     
4. Vận chuyển tài sản...             
   (Status: IN_TRANSIT)              
                                     4. Nhận hàng, mở app
                                     5. Scan QR code trên phiếu
                                     6. POST /transfers/{id}/verify-qr
                                        + token + GPS coordinates
                                     7. Hệ thống validate:
                                        ✓ Token khớp
                                        ✓ GPS trong bán kính hợp lệ
                                        ✓ Cập nhật tất cả tài sản
                                        ✓ Ghi lifecycle event
                                        ✓ Status → COMPLETED
```

---

## 6. AUDIT TRAIL (LỊCH SỬ VÒNG ĐỜI)

Bảng `asset_lifecycle_events` là **insert-only** - không bao giờ UPDATE hay DELETE.

Mỗi sự kiện lưu:
- `event_type`: CREATED, ALLOCATED, TRANSFERRED, QR_SCANNED, MAINTENANCE_STARTED...
- `previous_state` + `new_state`: JSON snapshot đầy đủ
- `changed_fields`: Chỉ các trường thay đổi
- `gps_coordinates`: Vị trí địa lý khi thực hiện
- `ip_address` + `user_agent`: Forensic data

PostgreSQL trigger tự động ghi event khi:
- INSERT asset → CREATED
- UPDATE status → STATUS_CHANGED  
- UPDATE location → LOCATION_CHANGED

---

## 7. CẤU TRÚC THƯ MỤC

```
asset-management/
├── backend/
│   ├── app/
│   │   ├── main.py                 FastAPI app + middleware
│   │   ├── api/v1/
│   │   │   ├── router.py           Route registration
│   │   │   └── endpoints/
│   │   │       ├── assets.py       Asset CRUD + QR + export
│   │   │       ├── transfers.py    Transfer flow + QR verify
│   │   │       ├── lifecycle.py    Audit trail queries
│   │   │       ├── maintenance.py  Maintenance records
│   │   │       ├── dashboard.py    Analytics & summary
│   │   │       └── auth.py         JWT authentication
│   │   ├── models/
│   │   │   └── assets.py           SQLAlchemy ORM models
│   │   ├── schemas/
│   │   │   └── assets.py           Pydantic request/response
│   │   ├── services/
│   │   │   ├── asset_service.py    Business logic
│   │   │   └── transfer_service.py Transfer + QR logic
│   │   ├── db/
│   │   │   └── session.py          Async DB session
│   │   └── core/
│   │       ├── config.py           Settings
│   │       └── auth.py             JWT helpers
│   ├── db/
│   │   └── schema.sql              Full PostgreSQL schema
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Assets.jsx
│   │   │   ├── Transfers.jsx
│   │   │   ├── Maintenance.jsx
│   │   │   └── Lifecycle.jsx
│   │   ├── components/
│   │   │   ├── QRScanner.jsx
│   │   │   ├── AssetForm.jsx
│   │   │   └── TransferFlow.jsx
│   │   └── services/
│   │       └── api.js              Axios API client
│   └── package.json
├── nginx/
│   └── nginx.conf
└── docker-compose.yml
```

---

## 8. TÍNH NĂNG THEO DỮ LIỆU THỰC TẾ

| Loại tài sản | Thuộc tính đặc biệt | Cảnh báo tự động |
|---|---|---|
| XE MÁY CƠ GIỚI (231 chiếc) | Giờ máy, Hạn đăng kiểm, Số khung/động cơ | Hết hạn đăng kiểm |
| THIẾT BỊ ĐO ĐẠC (RTK, Thủy bình) | Hạn hiệu chuẩn, Số chứng chỉ | Sắp hết hạn hiệu chuẩn |
| THIẾT BỊ VĂN PHÒNG | Model/Series | Khấu hao |
| CÔNG CỤ DỤNG CỤ | Số lượng, Quy cách | Số lượng tồn |
| ĐỒ BẢO HỘ LAO ĐỘNG | Số lượng, Lô | Hạn sử dụng |

---

*Phiên bản: 1.0.0 | Ngày: 06/03/2026*
