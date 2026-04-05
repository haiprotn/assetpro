-- ============================================================
-- MIGRATION: Tài liệu hồ sơ nhân viên
-- Chạy: psql -U asset_user -d asset_management -f migrate_personnel_docs.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS personnel_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    personnel_id    UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
    doc_type        VARCHAR(50)  NOT NULL DEFAULT 'OTHER',
    file_name       VARCHAR(255) NOT NULL,
    file_url        TEXT         NOT NULL,
    file_type       VARCHAR(100),
    file_size_bytes INTEGER,
    notes           TEXT,
    source          VARCHAR(50)  DEFAULT 'UPLOAD',
    original_path   TEXT,
    uploaded_by     UUID,
    uploaded_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdoc_personnel ON personnel_documents(personnel_id);
CREATE INDEX IF NOT EXISTS idx_pdoc_type      ON personnel_documents(doc_type);

COMMENT ON COLUMN personnel_documents.doc_type IS
    'PHOTO | ID_CARD | DEGREE | CERTIFICATE | CONTRACT | PROFILE | OTHER';
COMMENT ON COLUMN personnel_documents.source IS
    'UPLOAD = upload trực tiếp | LINKED = liên kết file cũ';
