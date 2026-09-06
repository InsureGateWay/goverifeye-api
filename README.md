# goVerifEye API

NestJS backend matching the current UI workflows and backend data contract. The code is organized by business capability; controllers validate HTTP input, services own use cases, repository ports isolate persistence, and TypeORM adapters handle database access.

## Architecture

- `auth`: OTP, registration, password hashing, and access tokens
- `onboarding`: company, administrator, address, and compliance documents
- `products`: approval lifecycle, listing, filtering, and archiving
- `codes`: generation and activation of verification-code batches
- `team`: invitations, roles, updates, and deactivation
- `reporting`: dashboard, reports, notifications, and audit read models
- `config`: strongly typed application and database options
- `database`: database-neutral TypeORM entities and migrations

All tenant-owned queries include `organizationId`. Business code depends on `ProductRepository`, not TypeORM. The adapter can therefore be replaced without modifying the use case. `DATABASE_TYPE` supports `postgres` and `mysql`; add the corresponding TypeORM driver if another engine is selected.

## Verification-code lifecycle

An active product belongs to one organization and can have many code allocations. GVE-16 generation uses a concurrency-safe namespace serial, keyed decimal permutation, Luhn check digit and server-recomputed HMAC tag. Codes remain 16-digit strings. New allocations use an internal UUIDv7 and a unique public `CB-` reference; codes, batch and product totals commit atomically.

Every batch starts `allocated`. Self-print requires a separate, audited vendor activation confirmation. Controlled physical batches require platform release, vendor password re-authentication and a one-time eight-digit batch PIN revealed only in the Vendor Portal. PINs are never generated for printing or delivery; only a versioned, batch-bound HMAC digest is stored. Rolling failures trigger a 15-minute activation cooldown without suspending product codes. Activation binds units to the manufacturer's product lot. See [the v3.3.7 API and migration notes](docs/batch-activation-v3.3.7.md) for endpoints, configuration and frontend rollout requirements.

## Run

1. Copy `.env.example` to `.env` and replace secrets. This workspace now has a Git-ignored development `.env`; never reuse those values outside local development.
2. Install dependencies with `npm install`.
3. Start PostgreSQL (or MySQL) and create the configured database. Pending migrations run automatically at startup.
4. Run `npm run start:dev`.

Swagger is exposed at `/docs`; health is at `/api/v1/health`. Run tests with `npm test` and coverage with `npm run test:cov`.

Readiness, Gmail, and storage configuration are documented in `docs/API_GAP_CLOSURE_REPORT.md`. The API uses Gmail OAuth offline credentials for email and private Supabase Storage buckets for compliance documents and generated artifacts. Payment processing is intentionally deferred and returns HTTP 501.

## Production notes

- Put secrets in a secret manager, never source control.
- Store uploads in object storage and persist only URLs plus metadata.
- Use a transactional outbox for email/SMS, approval, and code-generation jobs.
- Add rate limiting to authentication and public verification endpoints.
# Seeded vendor

Create or refresh an activated vendor for local testing:

```bash
npm run seed:vendor
```

The local defaults are `vendor.demo@goverifeye.test` and `Vendor123!`. The seed also creates two active demonstration products for this vendor. Override the `SEED_VENDOR_*` values in `.env.local` when different test credentials or company details are required. The command is idempotent and should be run explicitly; it is not executed during application startup or production deployment.

Product images use the Supabase bucket configured by `SUPABASE_PRODUCT_IMAGES_BUCKET` (default: `product-images`). Create this bucket as a public bucket so catalogue thumbnails can be displayed; uploads still require a short-lived signed upload URL issued by the authenticated backend.

Profile photos use the public Supabase bucket configured by `SUPABASE_PROFILE_IMAGES_BUCKET` (default: `profile-images`). The persisted user record stores the resulting public URL; uploading or replacing a photo still requires an authenticated, short-lived signed upload URL.
