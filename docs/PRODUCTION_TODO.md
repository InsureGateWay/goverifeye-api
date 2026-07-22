# goVerifEye API Production TODO

Last updated: July 22, 2026

Use this as a release gate. Do not mark the API production-ready until every applicable P0 item is checked and evidenced in the deployment record.

## P0 — release blockers

### Secrets and environment

- [ ] Rotate the Supabase database password previously used during development.
- [ ] Generate unique production values for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `CODE_ACTIVATION_PEPPER`; do not reuse values across environments.
- [ ] Store all production secrets in the hosting platform's secret manager, not `.env`, source control, CI logs, images, or deployment manifests.
- [ ] Set `NODE_ENV=production`.
- [ ] Set the exact production `CORS_ORIGINS`; do not use wildcards with credentials.
- [ ] Set the public HTTPS portal URL in `APP_PUBLIC_URL`.
- [ ] Confirm `.env` remains ignored by Git and is absent from repository history and container images.
- [ ] Document secret owners, rotation intervals, emergency rotation, and recovery procedures.

### Supabase database and verified TLS

- [ ] Use the direct database connection for migrations where IPv6 is available, or the Supavisor session pooler on port `5432` where IPv4 is required.
- [ ] Do not run schema migrations through the transaction pooler on port `6543`; transaction mode does not support prepared statements and is intended for transient application traffic.
- [ ] Download the Supabase CA certificate from the project **Connect → Connection Info and Certificate** section.
- [ ] Extend the deployment configuration to mount/read the CA certificate and run with full certificate verification.
- [ ] Set `DATABASE_SSL=true` and `DATABASE_SSL_REJECT_UNAUTHORIZED=true` after the CA is configured.
- [ ] Treat `DATABASE_SSL_REJECT_UNAUTHORIZED=false` as a temporary local-development workaround only.
- [ ] Run every TypeORM migration against a disposable Supabase/staging project before production.
- [ ] Verify forward migration, rollback strategy, migration duration, locking behavior, and recovery from partial failure.
- [ ] Disable automatic migrations at application startup for production if releases use a dedicated migration job; ensure only one migration runner can execute.
- [ ] Apply least-privilege database roles for application traffic where Supabase capabilities permit it.
- [ ] Confirm database network restrictions and permitted deployment egress addresses.

### Supabase Storage

- [ ] Create private `compliance-documents` and `generated-artifacts` buckets, or configure approved alternative names.
- [ ] Set `SUPABASE_URL` and a backend-only `SUPABASE_SERVICE_ROLE_KEY`/`sb_secret_...` value.
- [ ] Never expose the secret/service-role key to the browser or any `VITE_` environment variable.
- [ ] Confirm signed upload and download expiry values meet security requirements.
- [ ] Apply file-size, object-count, and organization quotas.
- [ ] Configure object lifecycle and retention rules for compliance documents and expired generated artifacts.
- [ ] Test tenant isolation, signed-link expiration, deleted-object handling, and service-key rotation.

### Malware and upload security

- [ ] Deploy or subscribe to a malware-scanning service compatible with `MALWARE_SCANNER_URL`.
- [ ] Store `MALWARE_SCANNER_API_KEY` in the secret manager.
- [ ] Set `MALWARE_SCAN_REQUIRED=true` in production so scanning fails closed.
- [ ] Test clean, infected, malformed, oversized, MIME-mismatched, timeout, and scanner-unavailable cases.
- [ ] Define quarantine, incident notification, retention, and deletion procedures for rejected files.

### Gmail API email delivery

- [ ] Create a dedicated Google Cloud production project and OAuth client.
- [ ] Enable the Gmail API and authorize only the `gmail.send` scope.
- [ ] Complete offline OAuth consent and securely store `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN`.
- [ ] Use a dedicated authorized sender configured through `GMAIL_USER_ID`, `GMAIL_FROM_EMAIL`, and `GMAIL_FROM_NAME`.
- [ ] Configure and verify the sender domain's SPF, DKIM, and DMARC records.
- [ ] Review Google OAuth verification requirements and Gmail sending quotas.
- [ ] Test OTP and invitation delivery, retries, revoked refresh tokens, quota failures, and dead-letter recovery.
- [ ] Add alerting for outbox backlog, repeated Gmail failures, and dead-letter messages.

### Authentication and authorization

- [ ] Confirm production JWT secrets are at least 32 random bytes and independently generated.
- [ ] Verify access/refresh expiry, issuer, audience, rotation, replay detection, logout, and session revocation through E2E tests.
- [ ] Create platform administrators through a controlled operational process; vendor self-registration must never grant `platform_admin`.
- [ ] Review and approve the route-by-route admin, staff, platform-admin, and public permission matrix.
- [ ] Test final-active-admin invariants and cross-tenant access for every resource.
- [ ] Add account recovery/password-reset delivery if required for launch.
- [ ] Consider breached-password screening and MFA for administrators/platform administrators.

### Verification codes and fraud controls

- [ ] Back up `CODE_ACTIVATION_PEPPER` securely; losing or changing it invalidates outstanding activation codes.
- [ ] Confirm one-time activation credentials never enter logs, analytics, audit metadata, or idempotency records.
- [ ] Load-test generation at the maximum configured batch size.
- [ ] Validate idempotency under concurrent requests and database retries.
- [ ] Tune repeat/high-frequency risk thresholds using staging data.
- [ ] Define handling and review procedures for suspicious verification events.
- [ ] Review public verification responses to prevent exposure of confidential vendor or product data.
- [ ] Approve IP/device hash retention, coarse-location consent, and privacy notices with legal/privacy stakeholders.

### Background jobs and outbox

- [ ] Run the outbox worker in an approved deployment topology and verify concurrent `SKIP LOCKED` processing.
- [ ] Configure retry limits, polling interval, worker concurrency, and dead-letter alerts.
- [ ] Verify processed email payloads are scrubbed and sensitive expired messages are removed according to retention policy.
- [ ] Test worker restart, duplicate delivery, storage failure, and poison-message recovery.
- [ ] Add an administrative dead-letter inspection and controlled replay procedure.

### API behavior and validation

- [ ] Confirm every collection endpoint enforces bounded pagination, allowlisted sorting, and validated filters.
- [ ] Validate the OpenAPI document and add response schemas/examples for all endpoints.
- [ ] Add contract snapshots to prevent accidental breaking changes.
- [ ] Verify all failures use `application/problem+json` and include a correlation ID without exposing internals.
- [ ] Configure body-size, header-size, request-timeout, and reverse-proxy limits.
- [ ] Confirm `/api/v1/health` is used for liveness and `/api/v1/health/ready` for readiness.
- [ ] Do not expose Swagger publicly unless authenticated or intentionally approved.

### Testing and release validation

- [ ] Run unit tests, production build, dependency audit, and `git diff --check` in CI.
- [ ] Add PostgreSQL integration tests using the same major version as Supabase.
- [ ] Add end-to-end tests for authentication, onboarding, products, approvals, codes, team, reports, storage, Gmail outbox, support, and audit logs.
- [ ] Add explicit cross-tenant tests for every tenant-owned read and mutation.
- [ ] Add concurrency tests for refresh rotation, invitations, code generation, final-admin checks, jobs, and outbox claiming.
- [ ] Run load tests for public verification, reporting, large code lists, and batch generation.
- [ ] Perform an independent security review and remediate all critical/high findings.

## P1 — operational hardening

### Scaling and rate limiting

- [ ] Replace the in-memory throttler store with Redis before running more than one API instance.
- [ ] Apply endpoint-specific limits for login, OTP, invitation acceptance, code activation, public verification, exports, and support tickets.
- [ ] Configure trusted-proxy settings correctly so client IP handling cannot be spoofed.
- [ ] Load-test database pool sizes against Supabase connection limits.

### Observability

- [ ] Emit structured JSON logs with automatic redaction of passwords, tokens, codes, cookies, authorization headers, API keys, and connection strings.
- [ ] Send logs to centralized storage with access controls and retention limits.
- [ ] Export metrics for latency, error rate, request volume, database pool use, OTP delivery, outbox lag, dead letters, verification outcomes, and worker duration.
- [ ] Add distributed tracing across HTTP, database, Gmail, storage, scanner, and worker operations.
- [ ] Create dashboards and actionable alerts with owners and escalation procedures.

### Data governance and recovery

- [ ] Define retention periods for users, sessions, OTPs, audit logs, verification events, documents, notifications, outbox entries, and generated artifacts.
- [ ] Automate cleanup for expired sessions, OTPs, idempotency records, signed artifacts, and processed outbox messages.
- [ ] Verify Supabase backups and enable point-in-time recovery where the business recovery objective requires it.
- [ ] Perform and document a restore drill.
- [ ] Define RPO/RTO targets, incident response, breach notification, and disaster-recovery runbooks.
- [ ] Review Nigerian and other applicable privacy, consumer, and data-protection obligations with counsel.

### Performance

- [ ] Add indexes based on production-like query plans and slow-query evidence.
- [ ] Introduce cursor pagination for verification events and code lists if offset pagination fails load targets.
- [ ] Cache safe dashboard/report aggregates with tenant-aware keys and explicit invalidation.
- [ ] Bound reporting date ranges to prevent unbounded in-memory trend aggregation.

## Payment — explicitly deferred

- [ ] Select a payment provider and document supported payment methods.
- [ ] Implement hosted checkout/payment initialization without handling raw card data.
- [ ] Add signed, replay-protected, idempotent webhook processing.
- [ ] Implement bank-transfer reconciliation, refunds, settlement, and dispute states.
- [ ] Ensure code generation/fulfilment begins only after server-confirmed payment.
- [ ] Add payment-specific audit, monitoring, reconciliation, and E2E tests.

Until these tasks are implemented, `POST /payments` must continue returning HTTP 501 and must not simulate payment success.

## Final release approval

- [ ] Engineering approval
- [ ] Security approval
- [ ] Privacy/legal approval
- [ ] Operations/SRE approval
- [ ] Product/business approval
- [ ] Rollback plan reviewed and tested
- [ ] Production smoke test completed
- [ ] Post-release monitoring window staffed
