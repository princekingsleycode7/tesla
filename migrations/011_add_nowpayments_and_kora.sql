-- ==========================================================
-- Migration 011: NOWPayments & Kora Payment Provider Expansion
-- ==========================================================

-- Add cryptocurrency and expanded payment tracking fields
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_currency VARCHAR(20);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS crypto_currency VARCHAR(20);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS network VARCHAR(50);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS crypto_amount NUMERIC(28, 12);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS fiat_amount NUMERIC(18, 4);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS transaction_hash VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_address TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS confirmation_count INT DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS expiration TIMESTAMP WITH TIME ZONE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_metadata JSONB DEFAULT '{}'::jsonb;

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_payments_provider ON payments(provider);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_hash ON payments(transaction_hash);

-- Record migration
INSERT INTO schema_migrations (version)
VALUES ('011_add_nowpayments_and_kora')
ON CONFLICT (version) DO NOTHING;
