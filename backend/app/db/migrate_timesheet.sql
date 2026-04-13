-- ============================================================
-- MIGRATION: Chấm công (Timesheet)
-- Chạy: psql -U asset_user -d asset_management -f migrate_timesheet.sql
-- ============================================================

-- Thêm cột timesheet_type cho bảng personnel (OFFICE mặc định)
ALTER TABLE personnel
    ADD COLUMN IF NOT EXISTS timesheet_type VARCHAR(20) DEFAULT 'OFFICE';

-- Bảng chấm công
CREATE TABLE IF NOT EXISTS timesheet_entries (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    personnel_id     UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
    entry_date       DATE NOT NULL,

    -- Khối nhân sự chính (OFFICE)
    hours_regular    NUMERIC(4,1) DEFAULT 8,
    is_leave         BOOLEAN      DEFAULT FALSE,
    overtime_hours   NUMERIC(4,1) DEFAULT 0,
    overtime_over_2h BOOLEAN      DEFAULT FALSE,
    work_days        NUMERIC(4,2) DEFAULT 1,
    work_description TEXT,

    -- Khối vận hành (OPERATOR) — equipment_name = NULL nếu là OFFICE
    equipment_name   VARCHAR(255),
    hours_main       NUMERIC(4,1) DEFAULT 0,
    hours_secondary  NUMERIC(4,1) DEFAULT 0,

    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index để truy vấn nhanh theo tháng
CREATE INDEX IF NOT EXISTS idx_ts_personnel ON timesheet_entries(personnel_id);
CREATE INDEX IF NOT EXISTS idx_ts_date      ON timesheet_entries(entry_date);

-- Unique: 1 nhân viên – 1 ngày – OFFICE (equipment IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ts_office_unique
    ON timesheet_entries(personnel_id, entry_date)
    WHERE equipment_name IS NULL;

-- Unique: 1 nhân viên – 1 ngày – 1 thiết bị (OPERATOR)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ts_operator_unique
    ON timesheet_entries(personnel_id, entry_date, equipment_name)
    WHERE equipment_name IS NOT NULL;

COMMENT ON TABLE timesheet_entries IS 'Chấm công hàng ngày. equipment_name IS NULL = khối nhân sự chính; có giá trị = khối vận hành';
