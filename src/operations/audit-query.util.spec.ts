import { applyAuditListFilters, mapAuditRowMetadata } from './audit-query.util';

describe('audit-query.util (Sheet2 #58/59)', () => {
  it('exposes metadata fields needed for audit detail', () => {
    const mapped = mapAuditRowMetadata({
      metadata: {
        ipAddress: '1.2.3.4',
        location: 'Lagos, NG',
        userAgent: 'Mozilla/5.0',
        device: 'Desktop · Chrome',
        sessionId: 'SES-1',
        authority: 'Vendor Admin',
        details: 'Generated batch',
      },
    } as any);

    expect(mapped).toMatchObject({
      ipAddress: '1.2.3.4',
      location: 'Lagos, NG',
      userAgent: 'Mozilla/5.0',
      device: 'Desktop · Chrome',
      sessionId: 'SES-1',
      authority: 'Vendor Admin',
      details: 'Generated batch',
    });
  });

  it('exports applyAuditListFilters helper', () => {
    expect(typeof applyAuditListFilters).toBe('function');
  });
});
