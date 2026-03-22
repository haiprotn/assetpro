# HƯỚNG DẪN BACKUP & RESTORE
## Hệ thống Quản lý Tài sản - dongthuanhaqlts.com

---

## 1. THÔNG TIN BACKUP

| Mục | Chi tiết |
|-----|----------|
| Script | `~/asset-management/backup.sh` |
| Lưu tại | `~/backups/` |
| Tự động | Mỗi ngày lúc **2:00 sáng** |
| Giữ lại | **7 ngày** gần nhất |

### Mỗi lần backup tạo ra 5 file:
```
~/backups/
├── database_YYYY-MM-DD_HH-MM.sql        ← Toàn bộ dữ liệu DB
├── images_YYYY-MM-DD_HH-MM.tar.gz       ← Hình ảnh tài sản
├── source_YYYY-MM-DD_HH-MM.tar.gz       ← Mã nguồn dự án
├── docker-compose_YYYY-MM-DD_HH-MM.yml  ← Cấu hình Docker
└── nginx_YYYY-MM-DD_HH-MM.conf          ← Cấu hình Nginx
```

---

## 2. CHẠY BACKUP THỦ CÔNG

```bash
~/asset-management/backup.sh
```

---

## 3. KIỂM TRA BACKUP

### Xem danh sách file backup:
```bash
ls -lh ~/backups/
```

### Xem log backup hàng ngày:
```bash
cat ~/backups/backup.log
```

### Kiểm tra lịch tự động:
```bash
crontab -l
```

### Kiểm tra dữ liệu trong file DB backup:
```bash
# Xem số dòng (file càng lớn càng có nhiều dữ liệu)
wc -l ~/backups/database_YYYY-MM-DD_HH-MM.sql

# Xem danh sách ảnh trong backup
tar tzf ~/backups/images_YYYY-MM-DD_HH-MM.tar.gz | wc -l
```

---

## 4. RESTORE KHI CÓ SỰ CỐ

### Bước 1 — Giải nén source code (nếu cần cài máy mới):
```bash
cd ~/
tar xzf ~/backups/source_YYYY-MM-DD_HH-MM.tar.gz
```

### Bước 2 — Khởi động hệ thống:
```bash
cd ~/asset-management
docker compose up -d
```

### Bước 3 — Restore database:
```bash
docker compose stop backend

docker exec asset_db psql -U asset_user -d postgres \
  -c "DROP DATABASE IF EXISTS asset_management;"
docker exec asset_db psql -U asset_user -d postgres \
  -c "CREATE DATABASE asset_management OWNER asset_user;"

docker exec -i asset_db psql -U asset_user -d asset_management \
  < ~/backups/database_YYYY-MM-DD_HH-MM.sql

docker compose start backend
```

### Bước 4 — Restore hình ảnh:
```bash
docker run --rm \
  -v asset-management_asset_images:/data \
  -v ~/backups:/backup \
  alpine tar xzf /backup/images_YYYY-MM-DD_HH-MM.tar.gz -C /data
```

### Bước 5 — Restore cấu hình Nginx (nếu cần):
```bash
sudo cp ~/backups/nginx_YYYY-MM-DD_HH-MM.conf /etc/nginx/sites-available/asset
sudo nginx -t && sudo systemctl reload nginx
```

---

## 5. KIỂM TRA SAU KHI RESTORE

```bash
# Kiểm tra containers đang chạy
docker compose ps

# Kiểm tra dữ liệu DB
docker exec asset_db psql -U asset_user -d asset_management \
  -c "SELECT COUNT(*) AS so_tai_san FROM assets;"

docker exec asset_db psql -U asset_user -d asset_management \
  -c "SELECT username, role FROM users;"

# Kiểm tra ảnh
docker run --rm \
  -v asset-management_asset_images:/data \
  alpine ls /data | wc -l
```

Truy cập **https://dongthuanhaqlts.com** và đăng nhập:
- `admin` / `Admin@2026`

---

## 6. TÀI KHOẢN HỆ THỐNG

| Tài khoản | Mật khẩu | Quyền |
|-----------|----------|-------|
| admin | Admin@2026 | Quản trị viên |
| manager | Manager@2026 | Quản lý |
