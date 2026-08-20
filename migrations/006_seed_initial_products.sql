-- ==========================================================
-- Migration 006: Seed Initial Tesla Investment Offerings
-- ==========================================================

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
    metadata
) VALUES (
    '10000000-0000-4000-8000-000000000001',
    'tsla-direct-allocation',
    'Tesla Direct Share Offering Tranche',
    'TSLA',
    'EQUITY_OFFERING',
    'Direct equity share allocation tranche at structured institutional offering price with guaranteed primary book-building priority.',
    248.0000,
    1000.0000,
    5000000.0000,
    29760000000.0000,
    'USD',
    'ACTIVE',
    '{"exchange": "NASDAQ", "offering_type": "Direct Allocation", "shares_offered": 120000000, "closing_date": "2025-03-28"}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

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
    metadata
) VALUES (
    '10000000-0000-4000-8000-000000000002',
    'tsla-megapack-yield-note',
    'Megapack Clean Energy Infrastructure Note',
    'TSLA-ENRG',
    'CLEAN_ENERGY_BOND',
    'Asset-backed clean energy infrastructure note delivering quarterly dividend distributions from global utility storage deployments.',
    500.0000,
    2500.0000,
    10000000.0000,
    500000000.0000,
    'USD',
    'ACTIVE',
    '{"term_months": 36, "annual_yield_percentage": 7.85, "payout_frequency": "Quarterly"}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

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
    metadata
) VALUES (
    '10000000-0000-4000-8000-000000000003',
    'tsla-optimus-robotics-tranche',
    'Optimus Humanoid Robotics Strategic Tranche',
    'TSLA-AI',
    'ROBOTICS_TRANCHE',
    'Strategic growth tranche accelerating automated manufacturing, neural training clusters, and global robotics commercialization.',
    1000.0000,
    5000.0000,
    25000000.0000,
    1000000000.0000,
    'USD',
    'ACTIVE',
    '{"sector": "Artificial Intelligence & Robotics", "liquidity_window_years": 4}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- Record migration
INSERT INTO schema_migrations (version)
VALUES ('006_seed_initial_products')
ON CONFLICT (version) DO NOTHING;
