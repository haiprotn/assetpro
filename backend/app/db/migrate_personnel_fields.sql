-- ============================================================
-- MIGRATION: Thêm trường học vấn, bảo hiểm, liên hệ khẩn cấp
-- Chạy: psql -U asset_user -d asset_management -f migrate_personnel_fields.sql
-- ============================================================

ALTER TABLE personnel
    ADD COLUMN IF NOT EXISTS education_level       VARCHAR(100),
    ADD COLUMN IF NOT EXISTS professional_level    VARCHAR(100),
    ADD COLUMN IF NOT EXISTS training_school       VARCHAR(255),
    ADD COLUMN IF NOT EXISTS work_history          TEXT,
    ADD COLUMN IF NOT EXISTS tax_code              VARCHAR(50),
    ADD COLUMN IF NOT EXISTS social_insurance_number VARCHAR(50),
    ADD COLUMN IF NOT EXISTS labor_contract_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS emergency_phone_1     VARCHAR(30),
    ADD COLUMN IF NOT EXISTS emergency_phone_2     VARCHAR(30);

COMMENT ON COLUMN personnel.education_level         IS 'Trình độ văn hóa';
COMMENT ON COLUMN personnel.professional_level      IS 'Trình độ chuyên môn';
COMMENT ON COLUMN personnel.training_school         IS 'Trường đào tạo';
COMMENT ON COLUMN personnel.work_history            IS 'Quá trình học tập và công tác';
COMMENT ON COLUMN personnel.tax_code                IS 'MST cá nhân';
COMMENT ON COLUMN personnel.social_insurance_number IS 'Số sổ BHXH';
COMMENT ON COLUMN personnel.labor_contract_number   IS 'Số hợp đồng lao động';
COMMENT ON COLUMN personnel.emergency_phone_1       IS 'SĐT người thân (1)';
COMMENT ON COLUMN personnel.emergency_phone_2       IS 'SĐT người thân (2)';
