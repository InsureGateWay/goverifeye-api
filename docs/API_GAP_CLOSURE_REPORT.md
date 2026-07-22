# API Gap Closure Report

Assessment date: July 22, 2026

## Result

The identified application-level API gaps have been closed, except payment processing, which is intentionally deferred. `POST /payments` now returns HTTP 501 instead of creating a misleading local payment record.

## Implemented in this pass

- Gmail API OAuth refresh-token adapter using `users.messages.send` with base64url MIME messages.
- Transactional OTP and invitation email outbox events; production responses never expose OTP or invitation secrets.
- Concurrent-safe outbox claiming, exponential retries, delivery scrubbing, and dead-letter state.
- Worker-backed batch export/print artifacts in private Supabase Storage.
- Signed private compliance-document upload/download URLs, server-side object retrieval, declared-size checks, magic-byte validation, SHA-256 fingerprints, malware-scanner adapter, and object deletion.
- Platform-admin onboarding and product review queues, decisions, reviewer identity from JWT, notes, and immutable review history.
- Platform-admin support-ticket queue and status workflow.
- Final-active-admin protection for team changes and account deactivation.
- Unified `application/problem+json` responses with correlation IDs for domain, validation, authentication, authorization, throttling, and unexpected errors.
- Database readiness endpoint at `GET /api/v1/health/ready`.
- Privacy-preserving verification telemetry, risk scores, repeat/high-frequency detection, suspicious counters, and coarse optional location.
- Report date/product filtering, location filtering, trend buckets, and batch funnel aggregation.
- Batch search by product name or exact batch ID.
- Idempotent code generation without persisting or replaying one-time activation credentials.
- Supabase/PostgreSQL migrations for reliability, documents, approvals, verification risk, and code-generation idempotency.

## Required deployment configuration

These are configuration/infrastructure prerequisites, not missing API code:

1. Create private Supabase buckets named `compliance-documents` and `generated-artifacts` (or configure different names).
2. Set `SUPABASE_SERVICE_ROLE_KEY` only in the backend secret manager.
3. Create a Google OAuth client with Gmail send scope and offline access, then set the Gmail client ID, client secret, refresh token, authorized sender, and user ID.
4. Configure a malware-scanner endpoint. Production should keep `MALWARE_SCAN_REQUIRED=true`.
5. Run the migrations against Supabase and execute cross-tenant E2E tests in the deployment pipeline.
6. For multiple API instances, replace in-memory throttling with a shared Redis throttler store.
7. Configure centralized logs, metrics, traces, backups, retention, and alerting in the hosting platform.

## Explicitly deferred

- Payment provider checkout, bank-transfer reconciliation, signed webhooks, refunds, and settlement. No fake payment success path is active.

## Validation

- NestJS strict production build: passed.
- Jest: 6 suites passed, 20 tests passed.
- `git diff --check`: passed; only line-ending notices were emitted.
- Live Supabase startup/migration execution could not be completed in the current command runner because its Node/npm executable intermittently disappeared from `PATH`; migrations remain configured to execute automatically at API startup.
