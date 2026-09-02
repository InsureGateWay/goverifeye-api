import { CryptographicCodeGenerator } from './cryptographic-code-generator.service';
describe('CryptographicCodeGenerator', () => {
  const service = new CryptographicCodeGenerator({ verificationCodeLength: 16, activationCodeLength: 8, activationMaxAttempts: 5, maxCodesPerBatch: 10_000, activationPepper: 'a-test-pepper-that-is-long-and-independent' });
  it('generates fixed-width numeric credentials', () => {
    const pair = service.generatePair(); expect(pair.verificationCode).toMatch(/^\d{16}$/); expect(pair.activationCode).toMatch(/^\d{8}$/); expect(pair.activationCodeHash).toMatch(/^[a-f0-9]{64}$/); expect(pair.activationCodeHash).not.toContain(pair.activationCode);
  });
  it('supports a platform-managed verification-code length', () => {
    const pair = service.generatePair(20); expect(pair.verificationCode).toMatch(/^\d{20}$/);
  });
  it('binds an activation secret to its verification code', () => {
    const pair = service.generatePair(); expect(service.matchesActivationCode(pair.verificationCode, pair.activationCode, pair.activationCodeHash)).toBe(true); expect(service.matchesActivationCode(pair.verificationCode, '00000000', pair.activationCodeHash)).toBe(false);
  });
  it('does not duplicate verification codes in a representative batch', () => {
    const codes = Array.from({ length: 10_000 }, () => service.generatePair().verificationCode); expect(new Set(codes).size).toBe(codes.length);
  });
  it('never generates more than two leading zeroes', () => {
    const codes = Array.from({ length: 10_000 }, () => service.generatePair(6).verificationCode); expect(codes.every((code) => !code.startsWith('000'))).toBe(true);
  });
  it('rejects obvious repeated and sequential patterns', () => {
    const allowed = (code: string) => (service as unknown as { isAllowedNumericCode(value: string): boolean }).isAllowedNumericCode(code);
    expect(allowed('111111111111')).toBe(false);
    expect(allowed('123456789012')).toBe(false);
    expect(allowed('987654321098')).toBe(false);
    expect(allowed('123400567890')).toBe(false);
    expect(allowed('482917305816')).toBe(true);
  });
});
