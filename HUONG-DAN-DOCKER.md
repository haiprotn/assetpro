# 🚀 HƯỚNG DẪN CHẠY ASSETPRO VỚI DOCKER

## BƯỚC 1 — Cài Docker Desktop

Tải tại: https://www.docker.com/products/docker-desktop/
- Windows: tải file .exe, cài, khởi động lại máy
- macOS: tải file .dmg, kéo vào Applications
- Mở Docker Desktop, chờ icon ở taskbar/menu bar ngừng loading

Kiểm tra:
```
docker --version
```
Kết quả: Docker version 27.x.x ✅

---

## BƯỚC 2 — Giải nén và mở VS Code

1. Giải nén file asset-management-system.zip
2. Mở VS Code → File → Open Folder → chọn thư mục asset-management

---

## BƯỚC 3 — Chạy hệ thống (CHỈ 1 LỆNH)

Mở Terminal trong VS Code (Ctrl+backtick), gõ:

```bash
docker-compose up --build
```

Lần đầu mất 5-10 phút (tải images, cài packages).
Các lần sau chỉ mất 30 giây:
```bash
docker-compose up
```

---

## BƯỚC 4 — Mở trình duyệt

| Địa chỉ | Mô tả |
|---------|-------|
| http://localhost:3001 | 🌐 Giao diện web chính |
| http://localhost:8001/health | ✅ Kiểm tra backend |
| http://localhost:8001/api/v1/docs | 📚 API Documentation |

---

## TÀI KHOẢN ĐĂNG NHẬP

| Username | Password | Quyền |
|----------|----------|-------|
| admin | Admin@2026 | Toàn quyền |
| manager | Manager@2026 | Phê duyệt |
| operator | Operator@2026 | Nhập/xuất |
| viewer | Viewer@2026 | Chỉ xem |

---

## CÁC LỆNH HỮU ÍCH

```bash
# Xem log realtime
docker-compose logs -f

# Xem log riêng backend
docker-compose logs -f backend

# Dừng hệ thống
docker-compose down

# Dừng và XÓA data (reset hoàn toàn)
docker-compose down -v

# Restart một service
docker-compose restart backend

# Vào trong container backend
docker exec -it asset_backend bash
```

---

## XỬ LÝ LỖI THƯỜNG GẶP

### ❌ "port is already allocated"
Port 3000 hoặc 8000 đang bị dùng bởi app khác.
```bash
# Windows: tìm và tắt process
netstat -ano | findstr :3001
taskkill /PID <số> /F

# macOS/Linux:
lsof -ti:3001 | xargs kill -9
```

### ❌ "Cannot connect to Docker daemon"
Docker Desktop chưa chạy → Mở Docker Desktop và chờ loading xong

### ❌ Backend báo lỗi database
Database chưa sẵn sàng → Đợi thêm 30 giây, backend tự kết nối lại

### ❌ Đăng nhập không được
Seed data chưa chạy. Thử reset:
```bash
docker-compose down -v
docker-compose up --build
```
