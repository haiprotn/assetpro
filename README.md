# 🏗️ AssetPro — Multi-type Asset Management System
### Công ty TNHH Đồng Thuận Hà

---

## 📁 Cấu trúc dự án

```
asset-management/
│
├── 📂 backend/                         ← FastAPI + PostgreSQL
│   ├── app/
│   │   ├── main.py                     ← FastAPI app + CORS + middleware
│   │   │
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── router.py           ← Đăng ký tất cả routes
│   │   │       └── endpoints/
│   │   │           ├── auth.py         ← POST /auth/login (JWT)
│   │   │           ├── assets.py       ← CRUD tài sản + QR image + export
│   │   │           ├── asset_types.py  ← Nhóm loại tài sản
│   │   │           ├── transfers.py    ← Phiếu điều chuyển + QR verify
│   │   │           ├── lifecycle.py    ← Audit trail query
│   │   │           ├── maintenance.py  ← Hồ sơ bảo trì
│   │   │           ├── locations.py    ← Công trường / Vị trí
│   │   │           ├── departments.py  ← Phòng ban
│   │   │           ├── personnel.py    ← Nhân sự
│   │   │           ├── qr.py           ← QR image + token lookup
│   │   │           └── dashboard.py    ← Summary + alerts + stats
│   │   │
│   │   ├── models/
│   │   │   └── assets.py               ← SQLAlchemy ORM (tất cả models)
│   │   │
│   │   ├── schemas/
│   │   │   └── assets.py               ← Pydantic request/response schemas
│   │   │
│   │   ├── services/
│   │   │   ├── asset_service.py        ← Business logic tài sản
│   │   │   └── transfer_service.py     ← Luồng điều chuyển + QR verify
│   │   │
│   │   ├── core/
│   │   │   ├── config.py               ← Settings (env vars)
│   │   │   └── auth.py                 ← JWT helpers + get_current_user
│   │   │
│   │   └── db/
│   │       └── session.py              ← Async SQLAlchemy engine + get_db
│   │
│   ├── db/
│   │   └── schema.sql                  ← PostgreSQL schema đầy đủ + seed data
│   │
│   ├── tests/
│   │   ├── unit/                       ← Unit tests
│   │   └── integration/                ← Integration tests
│   │
│   ├── requirements.txt                ← Python dependencies
│   ├── Dockerfile                      ← Container image
│   └── .env.example                    ← Mẫu biến môi trường
│
├── 📂 frontend/                        ← React 18 + Vite
│   ├── src/
│   │   ├── main.jsx                    ← Entry point (React + QueryClient)
│   │   ├── App.jsx                     ← Router setup (React Router v6)
│   │   ├── index.css                   ← Global styles + CSS variables
│   │   │
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx           ← Trang đăng nhập
│   │   │   ├── DashboardPage.jsx       ← Tổng quan + charts + alerts
│   │   │   ├── AssetsPage.jsx          ← Danh sách tài sản + search/filter
│   │   │   ├── AssetDetailPage.jsx     ← Chi tiết + lifecycle timeline
│   │   │   ├── TransfersPage.jsx       ← Phiếu điều chuyển + QR modal
│   │   │   ├── TransferDetailPage.jsx  ← Chi tiết phiếu
│   │   │   ├── MaintenancePage.jsx     ← Hồ sơ bảo trì
│   │   │   ├── LifecyclePage.jsx       ← Audit trail toàn hệ thống
│   │   │   └── ConfigPage.jsx          ← Cấu hình nhóm + thuộc tính động
│   │   │
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   │   ├── Layout.jsx          ← Sidebar + main layout
│   │   │   │   └── index.jsx           ← Card, Btn, Table, StatusBadge...
│   │   │   └── features/               ← Feature-specific components
│   │   │
│   │   ├── services/
│   │   │   └── api.js                  ← Axios client + all API functions
│   │   │
│   │   ├── store/
│   │   │   └── authStore.js            ← Zustand auth state
│   │   │
│   │   ├── hooks/                      ← Custom React hooks
│   │   └── utils/                      ← Helper functions
│   │
│   ├── public/                         ← Static assets
│   ├── package.json
│   ├── vite.config.js
│   ├── nginx.conf                      ← Nginx cho production build
│   ├── Dockerfile
│   └── .env.example
│
├── nginx/                              ← Nginx reverse proxy config
├── docker-compose.yml                  ← Full stack orchestration
└── README.md                           ← (file này)
```

---

## 🚀 Khởi động nhanh

### Development

```bash
# Clone và setup
git clone <repo>

# Backend
cd backend
cp .env.example .env          # điền DB credentials
pip install -r requirements.txt
uvicorn app.main:app --reload  # http://localhost:8001

# Database
psql -U postgres -c "CREATE DATABASE asset_management;"
psql -U postgres -d asset_management -f db/schema.sql

# Frontend (terminal khác)
cd frontend
cp .env.example .env
npm install
npm run dev                    # http://localhost:3001
```

### Production (Docker)

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# Chỉnh sửa các file .env

docker-compose up -d
# Backend: http://localhost:8001
# Frontend: http://localhost:3001
# API Docs: http://localhost:8001/api/v1/docs
```

---

## 🔑 Tài khoản mặc định

| Role | Username | Password |
|------|----------|----------|
| Super Admin | `admin` | `Admin@123` |
| Manager | `manager` | `Manager@123` |

---

## 📡 API Documentation

Swagger UI: `http://localhost:8001/api/v1/docs`  
ReDoc: `http://localhost:8001/api/v1/redoc`

---

*Stack: FastAPI · PostgreSQL 16 · Redis · React 18 · Vite · Docker*
