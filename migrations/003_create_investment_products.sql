-- ==========================================================
-- Migration 003: Investment Products and Offering Plans
-- ==========================================================

CREATE TABLE IF NOT EXISTS investment_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    ticker VARCHAR(20),
    category VARCHAR(50) NOT NULL CHECK (category IN ('EQUITY_OFFERING', 'DEBT_SECURITY', 'YIELD_NOTE', 'ROBOTICS_TRANCHE', 'CLEAN_ENERGY_BOND')),
    description TEXT,
    unit_price NUMERIC(18, 4) NOT NULL CHECK (unit_price > 0),
    min_investment NUMERIC(18, 4) NOT NULL CHECK (min_investment > 0),
    max_investment NUMERIC(18, 4) CHECK (max_investment IS NULL OR max_investment >= min_investment),
    target_amount NUMERIC(18, 4) CHECK (target_amount IS NULL OR target_amount > 0),
    total_raised NUMERIC(18, 4) NOT NULL DEFAULT 0.0000 CHECK (total_raised >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('UPCOMING', 'ACTIVE', 'PAUSED', 'CLOSED', 'SOLD_OUT')),
    offering_start_date TIMESTAMP WITH TIME ZONE,
    offering_end_date TIMESTAMP WITH TIME ZONE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_investment_products_slug ON investment_products(slug);
CREATE INDEX IF NOT EXISTS idx_investment_products_category ON investment_products(category);
CREATE INDEX IF NOT EXISTS idx_investment_products_status ON investment_products(status);

-- Record migration
INSERT INTO schema_migrations (version)
VALUES ('003_create_investment_products')
ON CONFLICT (version) DO NOTHING;
