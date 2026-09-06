# Batch identity and activation (spec v3.3.7)

New code allocations use UUIDv7 internally and a unique random Crockford reference, e.g. `CB-7K4M-9X2P-R6` (stored `CB-7K4M9X2PR6`). Batch lookup, export, print jobs and activation accept either reference representation or an internal UUID. The Master QR is JSON containing only `batchReference` and `deploymentMode`. Individual label QR URLs continue to contain only the verification code.

## API contract

All routes below use the existing `/api/v1` prefix and bearer authentication.

| Operation | Endpoint | Request | Authorization |
|---|---|---|---|
| Release physical batch | `POST /platform/manage-codes/batches/:id/release` | Empty body | Platform operations roles |
| First PIN reveal or replacement | `POST /code-batches/:id/activation-pin/reveal` | `{ "password": "current account password", "reason": "Lost PIN" }` | Assigned vendor administrator, approved organization |
| Activate physical batch | `POST /code-batches/:id/activate` | `{ "confirm": true, "productBatchReference": "LOT-2026-001", "password": "current account password", "pin": "4837 2051" }` | Assigned vendor administrator, approved organization |
| Activate self-print batch | `POST /code-batches/:id/activate` | `{ "confirm": true, "productBatchReference": "LOT-2026-001" }` | Assigned vendor administrator, approved organization |

The reveal response includes `batchReference`, `pin` in 4-4 grouping, and `revealedAt`. It is the only response containing a PIN and uses `Cache-Control: no-store, private`. Each request verifies the current account password independently of the session. A password-change-required account cannot pass step-up. Physical activation verifies the password again. Reveals and replacements never reuse the previous PIN. The PIN digest is consumed at activation; retries after activation return `alreadyActivated` without activating again.

Every newly generated batch remains `allocated`, including self-print. Physical release changes the batch to `released_for_activation`. Only the explicit vendor activation transaction sets `market_active`, binds all units to a manufacturer lot, and records the activation event. Lot references are unique per vendor/product; conflicting production or expiry dates are rejected. Product selection occurs at generation; platform generation now requires an approved vendor `productId` and cannot create a placeholder product.

The prior platform `/activate` route returns `VENDOR_ACTIVATION_REQUIRED`. The former Open Market claim routes return `OPEN_MARKET_CLAIM_DISABLED` (410), and the old seeder is disabled. Existing inventory must be handled through vendor assignment before dispatch; activation never assigns a vendor.

## Failure handling and keys

Defaults are five failures in a rolling 15-minute window, tracked separately for a batch, vendor organization, and source IP. PIN failures and failed step-up attempts both count. Successful reveal/reset/activation does not clear the failure history. Reaching any threshold starts a fixed 15-minute cooldown; blocked requests do not extend it. Counters and cooldowns are persisted in PostgreSQL and serialized across application instances. Product code lifecycle and risk states are never changed by these failures.

- `CODE_ACTIVATION_PEPPER`: independent secret, at least 32 characters; never reuse any GVE code master key.
- `ACTIVATION_PEPPER_VERSION`: current version, defaults to `1`.
- `ACTIVATION_PEPPER_RING_JSON`: map of historical versions to secrets; retain prior keys while any PIN digest references them.
- `ACTIVATION_MAX_ATTEMPTS`: defaults to `5` (allowed 1–100).
- `ACTIVATION_FAILURE_WINDOW_MINUTES`: defaults to `15` (allowed 1–60).

PIN length is always eight digits. `BATCH_ACTIVATION_CREDENTIAL_LENGTH` no longer controls it. Storage is HMAC-SHA256 over lowercase canonical UUID + `:` + eight-digit PIN, with timing-safe verification. No PIN enters generation responses, print/export jobs, email delivery, database fields, or routine logs. Activation events are append-only, with actor, session, time, batch and outcome; reveal/reset events include a reason.

## Migration and rollout

`1725700000000-complete-batch-activation-spec.ts` is a forward-only TypeORM migration. It preserves existing batch IDs and issued codes, backfills public references and vendor ownership, invalidates legacy generation-time PIN hashes, and introduces release metadata, lot bindings, versioned PIN digests, cooldown storage and append-only activation events. New tables enable RLS for the existing backend-owner access model; they have no direct client policies.

Existing internal UUIDv4 values remain valid cryptographic inputs. Existing `3.3.3` verification tags remain verifiable; new issuance uses `3.3.7`. Historical product-lot aliases are explicitly named `legacy-<batch UUID>` because the old database did not capture manufacturer lots. Historical active allocations retain their status; the migration cannot retroactively establish a deliberate vendor activation event. New activations require the actual manufacturer lot reference. Review historical allocations operationally before claiming full historical compliance.

Configure the pepper ring, coordinate the frontend contract update, back up the database, and deploy the migration with this backend. The application runs migrations at startup. Do not run the old backend against the migrated schema: its credential columns have been removed. No deployment or migration against the application database is performed by this implementation task.

## Specification interpretations

- AC-18's blanket prohibition on plaintext in any API response conflicts with the required portal reveal. The authenticated, uncached, one-time reveal response is the narrow exception; transient processing and display are permitted, persistence is not.
- The prefix hyphen in `CB-` remains in canonical storage. Only grouping separators are omitted.
- Step-up for activation applies to the controlled physical path; self-print retains the explicit authenticated confirmation described in §6.2.
- Failure thresholds/window lengths were not specified; the configurable defaults above supply them.

## Validation

Run `npm run build` and `npm test -- --runInBand`. The PostgreSQL integration suite is opt-in: set `BATCH_TEST_DATABASE_URL` to a **fresh disposable localhost database whose name begins with `batch_spec`**. It runs all preceding migrations, seeds a historical code, applies this migration, and exercises real generation, release, reveal/reset, key rotation, binding, rollback, cooldowns and concurrent activation. It refuses a nonlocal URL or an existing populated database.

This work covers backend batch identity and activation. The document's full-scale cryptographic review, 10-million-code generation benchmark, timing indistinguishability benchmark, physical shipment inspection, mobile QR/OCR tests and shopper false-positive acceptance measurements remain separate acceptance exercises.
