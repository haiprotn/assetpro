-- ============================================================
-- Migration: Đồng bộ nhất quán vị trí / phòng ban / chấm công
-- 1. Thêm address, province vào departments
-- 2. Đổi work_logs.location_id → department_id
-- ============================================================

-- 1. Thêm trường địa chỉ vào bảng phòng ban
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS address  TEXT,
  ADD COLUMN IF NOT EXISTS province VARCHAR(100);

-- 2. Đổi work_logs sang dùng department_id thay location_id
--    (nếu cột location_id tồn tại thì mới thực hiện)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='work_logs' AND column_name='location_id'
  ) THEN
    -- Thêm cột mới
    ALTER TABLE work_logs
      ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE CASCADE;

    -- Xóa dữ liệu cũ (work_logs chưa có dữ liệu thực)
    DELETE FROM work_logs WHERE department_id IS NULL;

    -- Bắt buộc NOT NULL
    ALTER TABLE work_logs ALTER COLUMN department_id SET NOT NULL;

    -- Xóa cột cũ và index cũ
    ALTER TABLE work_logs DROP CONSTRAINT IF EXISTS work_logs_location_id_fkey;
    ALTER TABLE work_logs DROP COLUMN IF EXISTS location_id;

    DROP INDEX IF EXISTS idx_wl_location;
    CREATE INDEX IF NOT EXISTS idx_wl_department ON work_logs(department_id);
  END IF;
END $$;
