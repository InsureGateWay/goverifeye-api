import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  const required = {
    DATABASE_URL: 'postgresql://localhost/database',
    JWT_ACCESS_SECRET: 'access-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    CODE_ACTIVATION_PEPPER: 'activation-pepper',
    GVE_CODE_MASTER_KEY: 'test-gve-master-key-with-at-least-32-characters',
    GVE_CODE_KEY_VERSION: 'test-v1',
  };

  it('converts a dotenv PORT string to a number', () => {
    expect(validateEnvironment({ ...required, PORT: '3001' }).PORT).toBe(3001);
  });

  it('rejects a port outside the TCP range', () => {
    expect(() => validateEnvironment({ ...required, PORT: '70000' })).toThrow();
  });

  it('requires a strong GVE code master key', () => {
    expect(() => validateEnvironment({ ...required, GVE_CODE_MASTER_KEY: 'too-short' })).toThrow();
  });
});
