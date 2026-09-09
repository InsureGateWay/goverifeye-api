import { ANOMALY_DETECTION_CATALOG } from './anomaly-processing.service';

describe('ANOMALY_DETECTION_CATALOG', () => {
  it('documents instant vs background anomaly processing', () => {
    expect(ANOMALY_DETECTION_CATALOG.instant.length).toBeGreaterThanOrEqual(5);
    expect(ANOMALY_DETECTION_CATALOG.background.length).toBeGreaterThanOrEqual(4);
    expect(
      ANOMALY_DETECTION_CATALOG.background.some((rule) => rule.key === 'code_velocity_24h'),
    ).toBe(true);
    expect(
      ANOMALY_DETECTION_CATALOG.instant.some((rule) => rule.key === 'high_frequency'),
    ).toBe(true);
  });
});
