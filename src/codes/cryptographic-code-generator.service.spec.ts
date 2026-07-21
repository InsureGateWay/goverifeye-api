import { CryptographicCodeGenerator } from './cryptographic-code-generator.service';
describe('CryptographicCodeGenerator', () => {
  const service = new CryptographicCodeGenerator({ verificationCodeLength: 16, activationCodeLength: 8, activationMaxAttempts: 5, maxCodesPerBatch: 10_000, activationPepper: 'a-test-pepper-that-is-long-and-independent' });
  it('generates fixed-width numeric credentials', () => {
    const pair = service.generatePair(); expect(pair.verificationCode).toMatch(/^\d{16}$/); expect(pair.activationCode).toMatch(/^\d{8}$/); expect(pair.activationCodeHash).toMatch(/^[a-f0-9]{64}$/); expect(pair.activationCodeHash).not.toContain(pair.activationCode);
  });
  it('binds an activation secret to its verification code', () => {
    const pair = service.generatePair(); expect(service.matchesActivationCode(pair.verificationCode, pair.activationCode, pair.activationCodeHash)).toBe(true); expect(service.matchesActivationCode(pair.verificationCode, '00000000', pair.activationCodeHash)).toBe(false);
  });
  it('does not duplicate verification codes in a representative batch', () => {
    const codes = Array.from({ length: 10_000 }, () => service.generatePair().verificationCode); expect(new Set(codes).size).toBe(codes.length);
  });
});
