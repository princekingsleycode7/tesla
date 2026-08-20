-- ==========================================================
-- Migration 010: Payment System Provider & Webhook Enhancements
-- ==========================================================

-- 1. Add additional payment fields
ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS provider_session_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS checkout_url TEXT,
    ADD COLUMN IF NOT EXISTS related_investment_id UUID REFERENCES user_investments(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_payments_provider_session_id ON payments(provider_session_id);
CREATE INDEX IF NOT EXISTS idx_payments_related_investment_id ON payments(related_investment_id);

-- 2. Create Webhook Events Audit and Idempotency Table
CREATE TABLE IF NOT EXISTS payment_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(255) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PROCESSED',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    signature VARCHAR(512),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_payment_webhook_provider_event UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_event ON payment_webhook_events(provider, event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_payment_id ON payment_webhook_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON payment_webhook_events(created_at);

-- Record migration
INSERT INTO schema_migrations (version)
VALUES ('010_payment_system_enhancements')
ON CONFLICT (version) DO NOTHING;
