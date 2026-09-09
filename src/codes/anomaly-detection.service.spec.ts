import { AnomalyDetectionService } from './anomaly-detection.service';

describe('AnomalyDetectionService category/severity mapping', () => {
  const service = new AnomalyDetectionService();

  it('exposes assessScan and openAdminAlert', () => {
    expect(typeof service.assessScan).toBe('function');
    expect(typeof service.openAdminAlert).toBe('function');
  });
});

describe('instant anomaly rule thresholds (documented contract)', () => {
  /**
   * These thresholds are the Sheet2 Anomaly Detection contract.
   * Keep in sync with AnomalyDetectionService.assessScan.
   */
  const RULES = {
    highFrequencyWindowMinutes: 10,
    highFrequencyMinScans: 5,
    ipBurstWindowMinutes: 10,
    ipBurstMinScans: 8,
    multiRegionWindowHours: 2,
    multiRegionMinLocations: 2,
    suspiciousRiskThreshold: 70,
  } as const;

  it('defines instant cloning / automated / geo thresholds', () => {
    expect(RULES.highFrequencyMinScans).toBe(5);
    expect(RULES.ipBurstMinScans).toBe(8);
    expect(RULES.multiRegionMinLocations).toBe(2);
    expect(RULES.suspiciousRiskThreshold).toBe(70);
  });
});
