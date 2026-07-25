import type { Request } from 'express';
import { onboardingAuditMetadata } from './onboarding-audit';

describe('onboardingAuditMetadata', () => {
  it('hashes sensitive network and device values and records consent versions', () => {
    process.env.AUDIT_METADATA_PEPPER = 'test-pepper';
    const request = {
      ip: '10.0.0.1',
      headers: {
        'x-forwarded-for': '203.0.113.10, 10.0.0.1',
        'x-device-fingerprint': 'raw-device-id',
        'x-client-timezone': 'Africa/Lagos',
        'x-client-locale': 'en-NG',
      },
      get: (name: string) => name.toLowerCase() === 'user-agent' ? 'Test Browser' : undefined,
    } as unknown as Request;

    const metadata = onboardingAuditMetadata(request, {
      termsAccepted: true,
      dataUsePolicyAccepted: true,
      termsVersion: 'v2',
      dataUsePolicyVersion: 'v3',
    }, 'draft', 'submitted', 'session-1');

    expect(metadata.ipHash).toHaveLength(64);
    expect(metadata.deviceFingerprintHash).toHaveLength(64);
    expect(JSON.stringify(metadata)).not.toContain('203.0.113.10');
    expect(JSON.stringify(metadata)).not.toContain('raw-device-id');
    expect(metadata.consent).toEqual({
      termsAccepted: true,
      termsVersion: 'v2',
      dataUsePolicyAccepted: true,
      dataUsePolicyVersion: 'v3',
    });
  });
});
