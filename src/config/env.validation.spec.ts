import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  const required = {
    DATABASE_URL: 'postgresql://localhost/database',
    JWT_ACCESS_SECRET: 'access-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    CODE_ACTIVATION_PEPPER: 'activation-pepper',
  };

  it('converts a dotenv PORT string to a number', () => {
    expect(validateEnvironment({ ...required, PORT: '3001' }).PORT).toBe(3001);
  });

  it('rejects a port outside the TCP range', () => {
    expect(() => validateEnvironment({ ...required, PORT: '70000' })).toThrow();
  });
});
