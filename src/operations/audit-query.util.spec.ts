import {
  applyAuditListFilters,
  auditDateBoundary,
  mapAuditRowMetadata,
} from './audit-query.util';

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

  it('includes the full selected end date in audit queries', () => {
    expect(auditDateBoundary('2026-09-10', 'to').toISOString()).toBe(
      '2026-09-10T23:59:59.999Z',
    );
    expect(auditDateBoundary('2026-09-10', 'from').toISOString()).toBe(
      '2026-09-10T00:00:00.000Z',
    );
  });

  it('preserves precise timestamp boundaries', () => {
    expect(
      auditDateBoundary('2026-09-10T14:30:00.000Z', 'to').toISOString(),
    ).toBe('2026-09-10T14:30:00.000Z');
  });
});
