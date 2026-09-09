/**
 * Sheet2 #55 — Geographical Activity region labels.
 * Collapses free-text scan locations into agreed regions for Reports.
 */

const REGION_MATCHERS: Array<{ region: string; pattern: RegExp }> = [
  { region: 'Port Harcourt', pattern: /port\s*harcourt|\bphc\b/i },
  { region: 'Lagos', pattern: /\blagos\b/i },
  { region: 'Kano', pattern: /\bkano\b/i },
  { region: 'Aba', pattern: /\baba\b/i },
  { region: 'Warri', pattern: /\bwarri\b/i },
  { region: 'Abuja', pattern: /\babuja\b|federal capital|fct\b/i },
  { region: 'Ibadan', pattern: /\bibadan\b/i },
  { region: 'Enugu', pattern: /\benugu\b/i },
  { region: 'Kaduna', pattern: /\bkaduna\b/i },
  { region: 'Calabar', pattern: /\bcalabar\b/i },
  { region: 'Benin City', pattern: /\bbenin(?:\s*city)?\b/i },
  { region: 'Onitsha', pattern: /\bonitsha\b/i },
  { region: 'Jos', pattern: /\bjos\b/i },
  { region: 'Ilorin', pattern: /\bilorin\b/i },
];

const NIGERIA_HINT =
  /nigeria|lagos|kano|abuja|port harcourt|phc|aba|warri|enugu|ibadan|kaduna|calabar|benin|jos|ilorin|onitsha|uyo|owerri|sokoto|maiduguri|fct\b/i;

const EXTERNAL_HINT =
  /ethiopia|ghana|kenya|egypt|tanzania|uganda|rwanda|morocco|south africa|addis|accra|nairobi|cairo|dar es salaam|kampala|kigali|casablanca|johannesburg|out of nigeria/i;

export function normalizeReportRegion(location?: string | null): string {
  const raw = (location ?? '').trim();
  if (!raw || raw.toLowerCase() === 'unknown') return 'Unknown';

  for (const matcher of REGION_MATCHERS) {
    if (matcher.pattern.test(raw)) return matcher.region;
  }

  if (EXTERNAL_HINT.test(raw) || !NIGERIA_HINT.test(raw)) {
    return 'Out of Nigeria';
  }

  return 'Other Nigeria';
}

export function isExternalReportRegion(region: string): boolean {
  return region === 'Out of Nigeria';
}

export type LocationAggregateInput = {
  location?: string | null;
  state?: string | null;
  region?: string | null;
  scans?: number;
  suspicious?: number;
};

export type GeographicalActivityRow = {
  state: string;
  scans: number;
  suspicious: number;
  percent: number;
  scope: 'nigeria' | 'external';
};

/** Aggregate raw location rows into region metrics with scan share %. */
export function aggregateGeographicalActivity(
  rows: LocationAggregateInput[],
  options: { limit?: number } = {},
): GeographicalActivityRow[] {
  const limit = options.limit ?? 8;
  const byRegion = new Map<string, { scans: number; suspicious: number }>();

  for (const row of rows) {
    const region = normalizeReportRegion(
      row.region ?? row.state ?? row.location ?? 'Unknown',
    );
    const scans = Number(row.scans ?? 0);
    const suspicious = Number(row.suspicious ?? 0);
    const existing = byRegion.get(region) ?? { scans: 0, suspicious: 0 };
    existing.scans += scans;
    existing.suspicious += suspicious;
    byRegion.set(region, existing);
  }

  const totalScans = [...byRegion.values()].reduce(
    (sum, row) => sum + row.scans,
    0,
  );

  return [...byRegion.entries()]
    .map(([state, stats]) => ({
      state,
      scans: stats.scans,
      suspicious: stats.suspicious,
      percent:
        totalScans > 0 ? Math.round((stats.scans / totalScans) * 100) : 0,
      scope: isExternalReportRegion(state)
        ? ('external' as const)
        : ('nigeria' as const),
    }))
    .sort((a, b) => b.scans - a.scans)
    .slice(0, limit <= 0 ? undefined : limit);
}
