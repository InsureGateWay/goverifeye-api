# GVE-16 Verification Flow Test Plan

## Purpose

This document verifies the backend implementation of GVE-16 specification version 3.3.3. It supersedes tests for variable-length codes, obvious-pattern rejection, and per-label activation credentials. No frontend change is part of this implementation.

## Release gates

| ID | Requirement | Test/evidence | Expected result |
| --- | --- | --- | --- |
| GVE-01 | Fixed numeric format | Generate a code and submit 15, 16, and 17 digit candidates. | Only 16 digits are accepted; display is 4-4-4-4. |
| GVE-02 | Controlled namespace | Generate batches concurrently for one and multiple organizations. | One namespace per organization; namespaces are unique. |
| GVE-03 | Concurrency-safe serial | Generate concurrent batches in the same namespace. | No duplicate committed `(namespace, internalSerial)` values and no reuse of an issued serial. |
| GVE-04 | Keyed decimal token | Check the fixed vector and at least 1,000 sequential serials. | Tokens are seven digits, unique, reversible with the key, and do not expose the serial sequence. |
| GVE-05 | Luhn | Change one digit in the first 12 digits. | Candidate is rejected before lookup. |
| GVE-06 | Canonical HMAC | Recompute the published vector independently. | Four-digit tag matches exactly. |
| GVE-07 | Allocation binding | Copy a valid code record to another batch/allocation. | Verification returns the same `invalid` result as a fabricated code. |
| GVE-08 | No enumeration oracle | Compare unknown-token and invalid-tag responses. | HTTP shape, status, and public message are indistinguishable. |
| GVE-09 | Batch activation | Generate a controlled physical-print batch and verify before/after activation. | Before: `unactivated`; after correct credential: `market_active`. |
| GVE-10 | Credential security | Inspect response, database, and logs. | Credential is returned only once; database has only Argon2id hash; logs contain no credential. |
| GVE-11 | Activation abuse | Submit five incorrect batch credentials. | Attempts are audited and allocation becomes `revoked`. |
| GVE-12 | Lifecycle authority | Verify recalled, revoked, retired, or inactive-product codes. | No genuine/live verdict is returned. |
| GVE-13 | Channel consistency | Submit identical code through `qr`, `ocr`, and `manual`. | All use the same verification pipeline; channel is recorded. |
| GVE-14 | Offline limitation | Test client-side format/Luhn without network. | Client may report malformed/valid-format only, never authenticity. |
| GVE-15 | Key rotation | Generate with key v1, rotate to v2 while retaining v1 in key ring. | Existing v1 and new v2 codes validate; missing old key fails closed. |
| GVE-16 | Legacy migration | Run migration on a copy containing old records. | Old rows remain queryable for history and are `retired`; dynamic length option is inactive. |
| GVE-17 | Cryptographic review | Independent reviewer examines Feistel domain handling, key derivation, canonical HMAC encoding, vectors, and rotation. | Written approval is required before production issuance. |

## Fixed interoperability vector

Use this vector only for tests; never use its key in production.

```text
format_version: 3.3.3
key_version: test-v1
master_key: independent-test-master-key-with-32-chars
namespace: 4827
internal_serial: 1
allocation_context: 11111111-1111-4111-8111-111111111111
public_token: 3659519
luhn_digit: 0
anti_fabrication_tag: 5296
canonical_code: 4827365951905296
display_code: 4827 3659 5190 5296
```

An independent implementation must reproduce this vector from the canonical byte encoding. A different result blocks release.

## Automated test commands

Run from the backend repository:

```powershell
npm run build
node node_modules/jest/bin/jest.js --runInBand
```

The focused suites are:

```powershell
node node_modules/jest/bin/jest.js --runInBand `
  src/codes/cryptographic-code-generator.service.spec.ts `
  src/codes/codes.service.spec.ts `
  src/codes/scan-identity.service.spec.ts `
  src/common/swagger-request-schemas.spec.ts
```

## API acceptance flow

1. Set a strong `GVE_CODE_MASTER_KEY`, current `GVE_CODE_KEY_VERSION`, and key ring on a non-production environment.
2. Apply migrations and generate a `preprinted` batch with `POST /api/v1/code-batches` and an idempotency key.
3. Securely capture the one-time `batchActivationCredential` from that first response.
4. Confirm a generated label returns `unactivated` at `POST /api/v1/code-batches/codes/verify`.
5. Activate with `POST /api/v1/platform/manage-codes/batches/{batchId}/activate` and JSON `{ "credential": "captured-value" }`.
6. Confirm the label returns `valid: true`, `status: market_active`, and the bound product.
7. Change one payload digit, use a fabricated tag, and use an unknown token; confirm no product identity leaks.
8. Repeat the valid scan from the same scan session and confirm risk/repeat metadata is recorded without changing the cryptographic verdict.

## Database inspection

For a generated GVE-16 row, confirm:

- `codeFormatVersion`, `keyVersion`, `namespace`, `internalSerial`, `publicToken`, `luhnDigit`, and `antiFabTag` are populated;
- `allocationId = batchId`, `productBatchId = batchId`, and `unitId = id`;
- uniqueness holds for `(namespace, internalSerial)` and `(namespace, publicToken)`;
- controlled batches have an activation hash before activation and no hash after successful activation; and
- verification events contain channel and hashed submitted-code evidence, with no raw secrets.

## Result record

Current local implementation check (2026-09-04):

| Check | Result |
| --- | --- |
| TypeScript/Nest build | PASS |
| Focused GVE/security suites | PASS - 39 tests |
| Complete backend suite | PASS - 110 tests in 26 suites |
| PostgreSQL migration rehearsal on a production-like copy | PENDING |
| Independent cryptographic review | PENDING - mandatory before production issuance |

Before release, append the build commit, migration environment/result, independent review reference, tester, date, and final pass/fail decision.
