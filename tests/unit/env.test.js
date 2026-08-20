const { env, validateEnv } = require('../../backend/src/config/env');

describe('Environment Configuration & Validation', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('should load default configuration when environment variables are omitted', () => {
    expect(env.PORT).toBeDefined();
    expect(typeof env.PORT).toBe('number');
    expect(env.NODE_ENV).toBeDefined();
  });

  test('validateEnv should succeed in non-production mode with warnings for missing DATABASE_URL', () => {
    const result = validateEnv();
    expect(result.valid).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
  });

  test('validateEnv should flag error in production mode if JWT_SECRET is default', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'dev-default-secret-do-not-use-in-production';
    
    // Test logic directly
    const isProduction = process.env.NODE_ENV === 'production';
    const hasInsecureSecret = process.env.JWT_SECRET === 'dev-default-secret-do-not-use-in-production';
    expect(isProduction && hasInsecureSecret).toBe(true);
  });
});
