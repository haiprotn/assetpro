-- ============================================================
-- Migration: Chấm công v2 — Projects, Attendance, Work Logs
-- ============================================================

-- 1. Công trình / dự án
CREATE TABLE IF NOT EXISTS projects (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(50)  NOT NULL,
    name        VARCHAR(200) NOT NULL,
    description TEXT,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_projects_code UNIQUE (code)
);

-- 2. Chấm công — 1 bản ghi / nhân viên / ngày
CREATE TABLE IF NOT EXISTS attendances (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    personnel_id         UUID        NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
    date                 DATE        NOT NULL,
    check_in             TIME,
    check_out            TIME,
    total_hours          NUMERIC(4,2) NOT NULL DEFAULT 0,
    late_minutes         INTEGER      NOT NULL DEFAULT 0,
    early_leave_minutes  INTEGER      NOT NULL DEFAULT 0,
    overtime_hours       NUMERIC(4,2) NOT NULL DEFAULT 0,
    status               VARCHAR(20)  NOT NULL DEFAULT 'present',   -- present/absent/leave/holiday
    notes                TEXT,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_attendance_personnel_date UNIQUE (personnel_id, date)
);

CREATE INDEX IF NOT EXISTS idx_att_date      ON attendances(date);
CREATE INDEX IF NOT EXISTS idx_att_personnel ON attendances(personnel_id);

-- 3. Phân bổ giờ làm theo công trình
CREATE TABLE IF NOT EXISTS work_logs (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    personnel_id UUID        NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
    date         DATE        NOT NULL,
    project_id   UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_type    VARCHAR(10) NOT NULL DEFAULT 'main',               -- main / sub
    hours        NUMERIC(4,2) NOT NULL,
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wl_date      ON work_logs(date);
CREATE INDEX IF NOT EXISTS idx_wl_personnel ON work_logs(personnel_id);
CREATE INDEX IF NOT EXISTS idx_wl_project   ON work_logs(project_id);
