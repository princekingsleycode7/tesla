-- ==========================================================
-- Migration 007: Expand Session Token Types
-- ==========================================================

-- Drop previous check constraint if existing and update with extended token types
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_token_type_check;

ALTER TABLE sessions ADD CONSTRAINT sessions_token_type_check 
    CHECK (token_type IN ('SESSION', 'REFRESH', 'ACCESS', 'EMAIL_VERIFICATION', 'PASSWORD_RESET'));

-- Record migration
INSERT INTO schema_migrations (version)
VALUES ('007_update_session_token_types')
ON CONFLICT (version) DO NOTHING;
