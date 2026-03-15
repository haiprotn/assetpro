#!/bin/bash
# ================================================================
#  SCRIPT BACKUP - Hệ thống Quản lý Tài sản
#  Lưu tại: ~/backups/  |  Giữ lại 7 ngày gần nhất
# ================================================================

BACKUP_DIR=~/backups
DATE=$(date +%Y-%m-%d_%H-%M)
LOG="$BACKUP_DIR/backup.log"

mkdir -p $BACKUP_DIR

echo "================================================"
echo " BẮT ĐẦU BACKUP: $DATE"
echo "================================================"

# ── 1. DATABASE ──────────────────────────────────────
echo "📦 Đang backup database..."
docker exec asset_db pg_dump -U asset_user asset_management \
  > $BACKUP_DIR/database_$DATE.sql \
  && echo "   ✅ Database OK: database_$DATE.sql" \
  || echo "   ❌ Database THẤT BẠI!"

# ── 2. HÌNH ẢNH ──────────────────────────────────────
echo "🖼️  Đang backup hình ảnh..."
docker run --rm \
  -v asset-management_asset_images:/data \
  -v $BACKUP_DIR:/backup \
  alpine tar czf /backup/images_$DATE.tar.gz -C /data . \
  && echo "   ✅ Hình ảnh OK: images_$DATE.tar.gz" \
  || echo "   ❌ Hình ảnh THẤT BẠI!"

# ── 3. SOURCE CODE ───────────────────────────────────
echo "💻 Đang backup source code..."
tar czf $BACKUP_DIR/source_$DATE.tar.gz \
  --exclude='~/asset-management/backend/__pycache__' \
  --exclude='~/asset-management/backend/.venv' \
  --exclude='~/asset-management/frontend/node_modules' \
  --exclude='~/asset-management/frontend/dist' \
  -C ~/ asset-management \
  && echo "   ✅ Source code OK: source_$DATE.tar.gz" \
  || echo "   ❌ Source code THẤT BẠI!"

# ── 4. CẤU HÌNH ──────────────────────────────────────
echo "⚙️  Đang backup cấu hình..."
cp ~/asset-management/docker-compose.yml $BACKUP_DIR/docker-compose_$DATE.yml
sudo cp /etc/nginx/sites-available/asset  $BACKUP_DIR/nginx_$DATE.conf
echo "   ✅ Cấu hình OK"

# ── 5. DỌN FILE CŨ (giữ 7 ngày) ─────────────────────
echo "🗑️  Xóa backup cũ hơn 7 ngày..."
find $BACKUP_DIR -name "database_*.sql"    -mtime +7 -delete
find $BACKUP_DIR -name "images_*.tar.gz"   -mtime +7 -delete
find $BACKUP_DIR -name "source_*.tar.gz"   -mtime +7 -delete
find $BACKUP_DIR -name "docker-compose_*"  -mtime +7 -delete
find $BACKUP_DIR -name "nginx_*.conf"      -mtime +7 -delete
echo "   ✅ Dọn xong"

# ── KẾT QUẢ ──────────────────────────────────────────
echo ""
echo "================================================"
echo " BACKUP HOÀN TẤT!"
echo " Thư mục: $BACKUP_DIR"
echo "================================================"
ls -lh $BACKUP_DIR | grep $DATE
echo ""

# Ghi log
echo "[$DATE] Backup hoàn tất" >> $LOG
