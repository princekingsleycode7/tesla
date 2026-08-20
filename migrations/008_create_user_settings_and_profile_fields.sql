-- ==========================================================
-- Migration 008: User Profile Extensions and User Settings
-- ==========================================================

-- 1. Extend Profiles Table with detailed address, avatar, and bio
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS state_province VARCHAR(100);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS postal_code VARCHAR(50);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS occupation VARCHAR(100);

-- 2. User Settings Table
CREATE TABLE IF NOT EXISTS user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    
    -- Account Settings
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    timezone VARCHAR(50) NOT NULL DEFAULT 'America/New_York',
    display_name VARCHAR(100),
    
    -- Security Settings
    two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    session_timeout_minutes INTEGER NOT NULL DEFAULT 60 CHECK (session_timeout_minutes BETWEEN 5 AND 1440),
    login_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Notification Preferences
    email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    push_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    investment_updates BOOLEAN NOT NULL DEFAULT TRUE,
    marketing_emails BOOLEAN NOT NULL DEFAULT FALSE,
    price_alerts BOOLEAN NOT NULL DEFAULT TRUE,
    security_alerts BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Display & Platform Preferences
    theme VARCHAR(20) NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light', 'system')),
    default_currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    hide_portfolio_balance BOOLEAN NOT NULL DEFAULT FALSE,
    auto_invest_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Record migration
INSERT INTO schema_migrations (version)
VALUES ('008_create_user_settings_and_profile_fields')
ON CONFLICT (version) DO NOTHING;
