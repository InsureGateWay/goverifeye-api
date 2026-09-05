# GVE-16 Verification Code Lifecycle

This document supersedes every earlier goVerifEye verification-code design. Production labels use one fixed format: **16 numeric digits**, displayed as `NNNN TTTT TTTL SSSS`. Spaces are presentation only; the canonical QR and API value contains exactly 16 digits.

## Code structure

| Part | Length | Purpose |
| --- | ---: | --- |
| `NNNN` | 4 | Controlled organization namespace. |
| `TTTTTTT` | 7 | Public token created by a keyed, decimal-preserving Feistel permutation of the namespace's internal serial. |
| `L` | 1 | Luhn check digit over `namespace + public token`, for quick typing/OCR error detection. |
| `SSSS` | 4 | HMAC-SHA256 anti-fabrication tag, truncated to four decimal digits. |

The database allocates each organization one namespace and increments its seven-digit serial under a database lock. Unique constraints prevent reuse of a serial or public token within a namespace. The internal serial is never printed.

## Creation and cryptographic protection

The backend derives separate versioned keys for token permutation and HMAC from `GVE_CODE_MASTER_KEY`. The HMAC input is canonical and unambiguous:

```text
UTF8("GVE16")
|| U16BE(length(format_version)) || UTF8(format_version)
|| ASCII(namespace) || ASCII(public_token)
|| U16BE(length(allocation_context)) || UTF8(allocation_context)
```

Each record stores the format/key versions, namespace, internal serial, public token, Luhn digit, HMAC tag, allocation ID, product-batch ID, and unit ID. The complete code is also stored for uniqueness and export. Key material is server-only and must never be returned, logged, or stored in the database.

## Allocation and activation

The batch is the activation boundary; individual labels do not have activation passwords.

- `self_print_digital`: generation is the deliberate activation event, so the batch and its codes become `market_active` immediately.
- `controlled_physical_print`: generation leaves the batch and codes `allocated`. The server returns one random batch activation credential once and stores only its Argon2id hash. A super administrator activates the entire allocation with `POST /api/v1/platform/manage-codes/batches/{id}/activate` and `{ "credential": "..." }`.

Five failed batch-credential attempts revoke the allocation. Successful and failed activation attempts are written to the audit log. Lifecycle states are `generated`, `allocated`, `market_active`, `recalled`, `revoked`, and `retired`.

## Customer verification

All QR, OCR, and manual entry paths call `POST /api/v1/code-batches/codes/verify` with the same canonical code. The backend performs these checks in order:

1. Remove whitespace and require exactly 16 digits.
2. Validate the Luhn digit before database lookup.
3. Look up the candidate by namespace and public token.
4. Recompute and timing-safely compare the versioned HMAC tag.
5. Confirm allocation, product-batch, unit, organization, and product bindings.
6. Require both code and batch to be `market_active`, and require an active product.
7. Record the scan and return the product verdict. Repeat-scan signals may return `review_recommended` without changing authenticity.

An unknown code and a known-looking code with an invalid HMAC tag both return the same public `invalid` result. This prevents the API from becoming a code-enumeration oracle. Invalid submissions are audit-recorded by hash, not as raw candidate codes.

## Offline and OCR behavior

Web and mobile clients may remove spaces, require 16 digits, and run Luhn locally. These checks only detect malformed input; they must never display a genuine/authentic verdict while offline. QR payloads contain the canonical digits. OCR is scan-to-fill only: crop to the label guide, extract a 16-digit candidate, run Luhn, show the candidate for confirmation, then call the backend.

## Operations and migration

Required production settings are `GVE_CODE_MASTER_KEY` and `GVE_CODE_KEY_VERSION`. Previous keys needed for verification remain in `GVE_CODE_KEY_RING_JSON`. Token and HMAC keys are derived separately. Rotation changes the active version for newly generated codes while retained key versions validate existing GVE-16 records.

The migration disables `codes.verification_code_length`; code length is no longer administrator-configurable. Pre-GVE-16 records are retained for history but changed to `retired`. Namespaces and serials are never recycled. Before production release, the decimal Feistel construction and supplied vectors require independent cryptographic review.
