-- ==========================================================
-- Migration 009: Enhance Investment Plans and User Investments
-- ==========================================================

-- 1. Add duration and return configuration to investment_products
ALTER TABLE investment_products
    ADD COLUMN IF NOT EXISTS duration_months INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS duration_days INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS expected_roi_percentage NUMERIC(8, 4) DEFAULT 0.0000,
    ADD COLUMN IF NOT EXISTS return_type VARCHAR(50) DEFAULT 'CAPITAL_APPRECIATION',
    ADD COLUMN IF NOT EXISTS payout_frequency VARCHAR(50) DEFAULT 'AT_MATURITY';

-- 2. Add calculation and tracking fields to user_investments
ALTER TABLE user_investments
    ADD COLUMN IF NOT EXISTS start_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS maturity_date TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS expected_return_amount NUMERIC(18, 4) DEFAULT 0.0000,
    ADD COLUMN IF NOT EXISTS expected_total_payout NUMERIC(18, 4) DEFAULT 0.0000,
    ADD COLUMN IF NOT EXISTS return_rate NUMERIC(8, 4) DEFAULT 0.0000,
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255) UNIQUE;

-- 3. Update existing seed products with standard duration and return attributes
UPDATE investment_products
SET 
    duration_months = 0,
    expected_roi_percentage = 0.0000,
    return_type = 'CAPITAL_APPRECIATION',
    payout_frequency = 'AT_MATURITY'
WHERE slug = 'tsla-direct-allocation';

UPDATE investment_products
SET 
    duration_months = 36,
    expected_roi_percentage = 7.8500,
    return_type = 'FIXED_YIELD',
    payout_frequency = 'QUARTERLY'
WHERE slug = 'tsla-megapack-yield-note';

UPDATE investment_products
SET 
    duration_months = 48,
    expected_roi_percentage = 18.5000,
    return_type = 'PROFIT_SHARE',
    payout_frequency = 'AT_MATURITY'
WHERE slug = 'tsla-optimus-robotics-tranche';

-- 4. Seed Fourth Offering: Cybercab Autonomous Mobility Yield Fund
INSERT INTO investment_products (
    id,
    slug,
    name,
    ticker,
    category,
    description,
    unit_price,
    min_investment,
    max_investment,
    target_amount,
    currency,
    status,
    duration_months,
    expected_roi_percentage,
    return_type,
    payout_frequency,
    metadata
) VALUES (
    '10000000-0000-4000-8000-000000000004',
    'tsla-cybercab-fleet-yield',
    'Cybercab Autonomous Fleet Yield Fund',
    'TSLA-CAB',
    'DEBT_SECURITY',
    'Revenue-share participation note backed by commercial Cybercab robotaxi ride miles and autonomous fleet network yields.',
    100.0000,
    500.0000,
    1000000.0000,
    250000000.0000,
    'USD',
    'ACTIVE',
    24,
    9.2500,
    'FIXED_YIELD',
    'MONTHLY',
    '{"fleet_type": "Cybercab Robotaxi", "insurance_backed": true}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- Record migration
INSERT INTO schema_migrations (version)
VALUES ('009_enhance_investment_plans_and_calculations')
ON CONFLICT (version) DO NOTHING;
