// v3.3.7 forbids claim-at-activation inventory and generation-time printed PINs.
console.error('Open Market seeding is retired. Generate a vendor-assigned physical batch, release it, and let the vendor reveal its PIN in the authenticated portal.');
process.exitCode = 1;
export {};
