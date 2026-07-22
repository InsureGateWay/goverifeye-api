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

An active product belongs to one organization and can have many generation batches. Each batch belongs to exactly one product and contains individually unique verification-code records. The generator uses Node's operating-system-backed `crypto.randomInt`, preserves the 16-digit code as text, and commits the batch, codes, and product totals atomically.

Each verification code starts `inactive` and has a separate numeric activation secret. Only an HMAC-SHA256 digest of that secret is stored. Raw activation secrets are returned once for the approved printing or fulfilment workflow. Five failed activation attempts suspend a code. Successful activation records the actor and timestamp. Public verification succeeds only when both the code and its associated product are active, and scan counters are updated transactionally.

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
