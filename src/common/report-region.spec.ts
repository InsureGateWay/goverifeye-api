import {
  aggregateGeographicalActivity,
  normalizeReportRegion,
} from './report-region';

describe('report-region (Sheet2 #55 Geographical Activity)', () => {
  it('normalizes free-text locations to agreed regions', () => {
    expect(
      normalizeReportRegion('12 Woji Str, Port Harcourt, Nigeria'),
    ).toBe('Port Harcourt');
    expect(normalizeReportRegion('Ikeja, Lagos')).toBe('Lagos');
    expect(normalizeReportRegion('22 Bole Rd, Addis Ababa, Ethiopia')).toBe(
      'Out of Nigeria',
    );
    expect(normalizeReportRegion('')).toBe('Unknown');
  });

  it('aggregates totals, suspicious counts, and share % by region', () => {
    const rows = aggregateGeographicalActivity([
      { location: 'Port Harcourt', scans: 400, suspicious: 2 },
      { location: '12 Woji Str, Port Harcourt, Nigeria', scans: 396, suspicious: 2 },
      { location: 'Lagos Island', scans: 658, suspicious: 1 },
      { location: 'Nairobi, Kenya', scans: 42, suspicious: 1 },
    ]);

    expect(rows[0]).toMatchObject({
      state: 'Port Harcourt',
      scans: 796,
      suspicious: 4,
      percent: 53,
    });
    expect(rows.find((row) => row.state === 'Lagos')).toMatchObject({
      scans: 658,
      suspicious: 1,
      percent: 44,
    });
    expect(rows.find((row) => row.state === 'Out of Nigeria')).toMatchObject({
      scans: 42,
      suspicious: 1,
      percent: 3,
      scope: 'external',
    });
  });
});
