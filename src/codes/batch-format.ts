import { randomBytes, randomInt } from 'crypto';

export const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// RFC 9562: 48-bit Unix milliseconds followed by 74 random bits.
export function newCodeBatchId(): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(Date.now(), 0, 6);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function canonicalBatchId(value: string): string {
  if (!UUID.test(value)) throw new Error('Code batch ID must be a canonical UUID');
  return value.toLowerCase();
}

export function newBatchReference(): string {
  return 'CB-' + Array.from({ length: 10 }, () => CROCKFORD_BASE32[randomInt(32)]).join('');
}

export function normalizeBatchReference(value: string): string | null {
  const compact = value.trim().toUpperCase().replace(/[-\s]/g, '');
  return /^CB[0-9A-HJKMNP-TV-Z]{10}$/.test(compact) ? `CB-${compact.slice(2)}` : null;
}

export function displayBatchReference(value: string): string {
  const canonical = normalizeBatchReference(value);
  if (!canonical) throw new Error('Invalid batch reference');
  const token = canonical.slice(3);
  return `CB-${token.slice(0, 4)}-${token.slice(4, 8)}-${token.slice(8)}`;
}

export function batchLookup(value: string): { id: string } | { batchReference: string } | null {
  if (UUID.test(value)) return { id: value.toLowerCase() };
  const batchReference = normalizeBatchReference(value);
  return batchReference ? { batchReference } : null;
}

export function masterQrPayload(batch: { batchReference: string; activationMode: string }): string {
  return JSON.stringify({ batchReference: normalizeBatchReference(batch.batchReference), deploymentMode: batch.activationMode });
}
