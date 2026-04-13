-- Migration: Tạo bảng chấm công
CREATE TABLE IF NOT EXISTS timesheet_rows (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    personnel_id    UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
    year            INT  NOT NULL,
    month           INT  NOT NULL,
    row_index       INT  NOT NULL DEFAULT 0,
    row_label       VARCHAR(100),
    work_description TEXT,
    hours           JSONB NOT NULL DEFAULT '{}',
    leave_days      NUMERIC(4,1) NOT NULL DEFAULT 0,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique: mỗi nhân viên chỉ có 1 dòng/row_index trong 1 tháng
CREATE UNIQUE INDEX IF NOT EXISTS idx_ts_row_unique
    ON timesheet_rows(personnel_id, year, month, row_index);

CREATE INDEX IF NOT EXISTS idx_ts_personnel
    ON timesheet_rows(personnel_id);

CREATE INDEX IF NOT EXISTS idx_ts_year_month
    ON timesheet_rows(year, month);
