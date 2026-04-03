-- ============================================================
-- MIGRATION: Quản lý nhân sự
-- Database: PostgreSQL
-- Chạy lệnh: psql -U <user> -d <db> -f migrate_hr.sql
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────
-- 1. Vị trí công việc (positions)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS positions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(50)  NOT NULL UNIQUE,
    title       VARCHAR(255) NOT NULL,
    description TEXT,
    parent_id   UUID REFERENCES positions(id),
    salary_from NUMERIC(18,2),
    salary_to   NUMERIC(18,2),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE positions IS 'Vị trí công việc (VD: Kỹ sư phần mềm, Kế toán)';

-- ──────────────────────────────────────────────────────────
-- 2. Chức danh (position_titles)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS position_titles (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code       VARCHAR(50) UNIQUE,
    title      VARCHAR(255) NOT NULL,
    priority   INTEGER NOT NULL DEFAULT 0,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE position_titles IS 'Chức danh (VD: Giám đốc, Trưởng phòng, Nhân viên)';

-- Dữ liệu mặc định chức danh
INSERT INTO position_titles (code, title, priority) VALUES
    ('DIRECTOR',   'Giám đốc',          1),
    ('VICE_DIR',   'Phó giám đốc',      2),
    ('MANAGER',    'Trưởng phòng',      3),
    ('VICE_MGR',   'Phó trưởng phòng',  4),
    ('TEAM_LEAD',  'Trưởng nhóm',       5),
    ('SENIOR',     'Chuyên viên cao cấp', 6),
    ('SPECIALIST', 'Chuyên viên',       7),
    ('STAFF',      'Nhân viên',         8),
    ('INTERN',     'Thực tập sinh',     9)
ON CONFLICT (code) DO NOTHING;

-- ──────────────────────────────────────────────────────────
-- 3. Loại hợp đồng (contract_types)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contract_types (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code       VARCHAR(50)  NOT NULL UNIQUE,
    title      VARCHAR(255) NOT NULL,
    months     INTEGER,   -- NULL = không xác định thời hạn
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE contract_types IS 'Loại hợp đồng lao động';

-- Dữ liệu mặc định
INSERT INTO contract_types (code, title, months) VALUES
    ('PROBATION',    'Hợp đồng thử việc',                2),
    ('FIXED_1Y',     'Hợp đồng xác định thời hạn 1 năm', 12),
    ('FIXED_2Y',     'Hợp đồng xác định thời hạn 2 năm', 24),
    ('FIXED_3Y',     'Hợp đồng xác định thời hạn 3 năm', 36),
    ('INDEFINITE',   'Hợp đồng không xác định thời hạn', NULL),
    ('PART_TIME',    'Hợp đồng bán thời gian',           NULL),
    ('SEASONAL',     'Hợp đồng thời vụ',                 3)
ON CONFLICT (code) DO NOTHING;

-- ──────────────────────────────────────────────────────────
-- 4. Mở rộng bảng personnel (thêm các cột nhân sự)
-- ──────────────────────────────────────────────────────────

-- Thông tin cá nhân
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS birthday           DATE;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS gender             VARCHAR(10);
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS marital_status     VARCHAR(20);
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS private_code       VARCHAR(20);
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS private_code_date  DATE;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS private_code_place VARCHAR(255);
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS nationality        VARCHAR(100);
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS ethnicity          VARCHAR(100);

-- Liên hệ bổ sung
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS mobile            VARCHAR(20);
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS home_address      TEXT;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS current_address   TEXT;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS photo_url         TEXT;

-- Công việc
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS position_id       UUID REFERENCES positions(id);
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS job_title_id      UUID REFERENCES position_titles(id);
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS job_status        VARCHAR(30);
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS job_date_join     DATE;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS job_date_try      DATE;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS job_reldate_join  DATE;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS job_date_out      DATE;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS job_out_reason    TEXT;

-- Lương
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS salary_method     VARCHAR(30);
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS salary_real       NUMERIC(18,2);

-- Audit
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS description       TEXT;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS created_by        UUID;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS updated_by        UUID;

-- Index tìm kiếm
CREATE INDEX IF NOT EXISTS idx_personnel_dept     ON personnel(department_id);
CREATE INDEX IF NOT EXISTS idx_personnel_pos      ON personnel(position_id);
CREATE INDEX IF NOT EXISTS idx_personnel_status   ON personnel(job_status);
CREATE INDEX IF NOT EXISTS idx_personnel_active   ON personnel(is_active);
CREATE INDEX IF NOT EXISTS idx_personnel_name     ON personnel USING gin(to_tsvector('simple', full_name));

-- ──────────────────────────────────────────────────────────
-- 5. Hợp đồng lao động (employee_contracts)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_contracts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_code     VARCHAR(100) NOT NULL UNIQUE,
    personnel_id      UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
    contract_type_id  UUID REFERENCES contract_types(id),
    department_id     UUID REFERENCES departments(id),
    position_id       UUID REFERENCES positions(id),
    job_title_id      UUID REFERENCES position_titles(id),
    date_start        DATE NOT NULL,
    date_finish       DATE,                         -- NULL = không xác định thời hạn
    salary            NUMERIC(18,2),
    salary_allowances NUMERIC(18,2) DEFAULT 0,
    status            VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE/EXPIRED/LIQUIDATED/PENDING
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by        UUID
);
COMMENT ON TABLE employee_contracts IS 'Hợp đồng lao động của nhân viên';

CREATE INDEX IF NOT EXISTS idx_contract_personnel ON employee_contracts(personnel_id);
CREATE INDEX IF NOT EXISTS idx_contract_status    ON employee_contracts(status);
CREATE INDEX IF NOT EXISTS idx_contract_dates     ON employee_contracts(date_start, date_finish);

COMMIT;
