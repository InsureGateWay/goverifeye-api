export const ASSIGNED_BATCH_PLACEHOLDER_PRODUCT =
  '__goVerifEye Unassigned Allocation__';

export function isInternalProductName(name?: string | null): boolean {
  return name === ASSIGNED_BATCH_PLACEHOLDER_PRODUCT;
}
