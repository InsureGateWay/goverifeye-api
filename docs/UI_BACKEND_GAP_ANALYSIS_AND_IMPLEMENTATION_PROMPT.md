# goVerifEye UI-to-Backend Gap Analysis and Implementation Brief

## 1. Purpose

This document audits the current React UI against the NestJS backend and defines the work required to deliver a production-ready API. It is both:

1. A complete gap register for the current UI screens and supporting components.
2. A senior developer implementation prompt with security, validation, testing, and acceptance requirements.

The API must follow strict tenant isolation. Every authenticated vendor, administrator, and staff identity must come from the validated JWT. Client-supplied user IDs, staff IDs, vendor IDs, organization IDs, company IDs, roles, or ownership fields must never be trusted for authorization or entity ownership.

## 2. Current assessment

The backend is a useful foundation but does not yet provide complete UI coverage. Authentication, onboarding, products, code batches, and team management are partially implemented. Dashboard, reports, audit logs, and notifications are placeholders. Settings, uploads, exports, printing, payments, and several lifecycle operations are missing.

### Overall status

| Capability | Status | Primary issue |
|---|---|---|
| Authentication | Partial | Registration challenge flow, refresh, logout, and session management are incomplete |
| Onboarding | Partial | Combined document update only; no drafts or document lifecycle |
| Dashboard | Placeholder | Empty hard-coded response |
| Products | Partial CRUD | Read-one, update, resubmit, restore, and supporting analytics are missing |
| Verification codes | Partial | Secure generation exists; management, exports, history, fulfilment, and list querying are incomplete |
| Team | Partial CRUD | Get-one, invitation lifecycle, reactivation, filtering, sorting, and pagination are missing |
| Reports | Placeholder | No database-backed reporting or complete filter contract |
| Audit logs | Placeholder | No persisted audit model or query implementation |
| Settings | Missing | No company, personal, password, or account-state endpoints |
| Notifications | Placeholder | No persistence, mutations, filtering, sorting, or pagination |
| Uploads | Missing | No controlled upload workflow or file-security validation |
| Payments | Missing | UI flows have no quotation, payment, or reconciliation API |
| List standards | Non-compliant | Most collections lack filtering, sorting, and pagination |

## 3. Non-negotiable architecture and identity rules

### 3.1 JWT identity source

JWT access tokens must contain the minimum trusted identity claims:

```json
{
  "sub": "user-uuid",
  "organizationId": "organization-uuid",
  "role": "admin|staff",
  "permissions": ["products:read", "products:write"],
  "sessionId": "session-uuid",
  "iat": 0,
  "exp": 0,
  "iss": "goverifeye-api",
  "aud": "goverifeye-vendor-portal"
}
```

Rules:

- `sub` is the authenticated vendor administrator or staff user ID.
- `organizationId` is the authenticated vendor/company tenant.
- `role` and permissions are authorization inputs issued by the server.
- Ownership fields such as `createdBy`, `generatedBy`, `activatedBy`, `updatedBy`, and `invitedBy` must be assigned from `sub`.
- Tenant fields such as `organizationId`, `vendorId`, or `companyId` must be assigned from the JWT tenant claim.
- DTOs must not expose writable identity or tenant properties.
- Query strings and route parameters may select a resource ID, but the database query must also constrain that resource by JWT `organizationId`.
- A route such as `GET /products/:id` must query using both `id` and `organizationId`; it must not retrieve by `id` and check ownership later.
- Never accept role, permissions, organization, vendor, or staff identity from request bodies.
- Never use a development identity fallback.

### 3.2 Token and session security

- Use short-lived signed access tokens and rotating refresh tokens.
- Store only a hash of each refresh token or token family secret.
- Include `sessionId`, issuer, audience, issued-at, and expiry claims.
- Revoke the refresh-token family on replay detection.
- Revoke sessions on password change, user deactivation, account deactivation, or security-sensitive role changes.
- Validate signing algorithm, signature, issuer, audience, expiry, and required claims.
- Use separate strong secrets or asymmetric keys for access and refresh tokens.
- Never put passwords, OTPs, activation codes, or private document data in JWT claims.

### 3.3 Authorization

- Apply authentication globally and explicitly mark public routes.
- Use role/permission guards for administrative operations.
- Staff permissions must be server-owned and checked per operation.
- Return `404` for tenant-owned resources that do not exist in the caller's tenant to reduce identifier enumeration.
- Public verification endpoints must expose only approved product information.

### 3.4 Separation of concerns

- Controllers handle HTTP mapping and DTO validation only.
- Application services coordinate use cases and transactions.
- Domain services enforce business rules.
- Repository ports isolate application code from TypeORM.
- TypeORM adapters handle persistence and tenant-scoped queries.
- External email, SMS, payment, file storage, and printing systems are accessed through interfaces and adapters.
- Cross-module side effects use domain events and a transactional outbox where delivery must be reliable.

## 4. Screen-by-screen gap register

### 4.1 Public landing and verification

Required behavior:

- Submit a 16-digit verification code.
- Return a safe public verification result.
- Show approved product and manufacturer information.
- Record verification count, timestamp, risk signals, and optional coarse location.
- Rate-limit public attempts and avoid leaking whether inactive codes exist beyond the approved response contract.

Current coverage:

- Public code verification exists.

Gaps:

- Dedicated public response DTO is required.
- Verification event persistence and risk classification are incomplete.
- Rate limiting, abuse controls, and privacy rules are required.
- Location consent and trusted proxy/IP handling need definition.

### 4.2 Login

Required endpoints:

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/logout-all`
- `GET /auth/me`

Gaps:

- Refresh-token rotation and revocation are missing.
- Logout and current-session endpoints are missing.
- Account lockout/rate limiting and authentication audit events are required.

### 4.3 Registration and OTP screens

Required endpoints:

- `POST /auth/registration-challenges`
- `POST /auth/registration-challenges/:challengeId/verify`
- `POST /auth/registrations`
- `POST /auth/registration-challenges/:challengeId/resend`

The verify endpoint must return a short-lived, single-use registration proof. Password creation consumes that proof; it must not require reusing a consumed OTP.

Gaps:

- The current verification method consumes the OTP, while registration expects the OTP again.
- Challenge IDs, single-use registration proofs, resend limits, delivery integration, expiry, and audit events are missing.
- OTPs must use a CSPRNG, be hashed, expire quickly, have attempt limits, and be invalidated after use.

### 4.4 Invited staff registration

Required endpoints:

- `GET /invitations/:token/summary` as a carefully limited public endpoint
- `POST /invitations/:token/challenges`
- `POST /invitations/:token/accept`
- Authenticated administration endpoints to resend and revoke invitations

Gaps:

- Invitation validation and acceptance are missing.
- Invitation tokens must be random, hashed at rest, single-use, scoped to an organization and intended email, and time-limited.

### 4.5 Onboarding company details

Required endpoints:

- `GET /onboarding`
- `PATCH /onboarding/company`
- `PATCH /onboarding/administrator`
- `PATCH /onboarding/address`
- `POST /onboarding/submit`
- `GET /onboarding/status`

Gaps:

- Only a combined `GET` and `PUT` currently exist.
- There is no draft state, optimistic concurrency contract, independent step validation, submission lock, rejection feedback, or review history.
- Administrator identity must be derived from JWT where the administrator is the current user. A client may update profile attributes but cannot choose the administrator user ID.

### 4.6 Onboarding documents

Required endpoints:

- `POST /uploads/presign` or a controlled multipart upload endpoint
- `GET /onboarding/documents` with filter, sorting, and pagination
- `POST /onboarding/documents`
- `GET /onboarding/documents/:id`
- `PATCH /onboarding/documents/:id`
- `DELETE /onboarding/documents/:id`

Security requirements:

- Allowlisted MIME type and extension checks.
- Validate actual file signatures, not only request headers.
- Enforce file-size limits.
- Generate server-owned storage keys.
- Scan uploaded documents for malware.
- Use private object storage and short-lived signed download URLs.
- Never accept an unrestricted arbitrary document URL as trusted content.

Current gap:

- The backend accepts document URLs embedded in onboarding data but has no secure document lifecycle.

### 4.7 Dashboard and empty dashboard

Required endpoints:

- `GET /dashboard/summary`
- `GET /dashboard/scan-trends`
- `GET /dashboard/top-products`
- `GET /dashboard/batch-status`
- `GET /dashboard/locations`
- `GET /dashboard/onboarding-checklist`

Gaps:

- Current dashboard response is a hard-coded empty placeholder.
- Date range, product, location, time-zone, comparison-period, sorting, and pagination contracts are missing.
- Expanded lists such as top products and locations must be separate paginated resources rather than unbounded arrays.

### 4.8 Products page and add-product modal

Required endpoints:

- `GET /products`
- `POST /products`
- `GET /products/:id`
- `PATCH /products/:id`
- `DELETE /products/:id` where business rules allow permanent deletion
- `POST /products/:id/archive`
- `POST /products/:id/restore`
- `POST /products/:id/resubmit`

Required product list filters:

- `search`
- `status`
- `createdBy`
- `createdFrom` and `createdTo`
- `updatedFrom` and `updatedTo`
- `sortBy`
- `sortDirection`
- `page`
- `pageSize`

Gaps:

- Current API supports list, create, and archive only.
- Read-one, update, resubmit, restore, and controlled deletion are missing.
- Current product list has search/status and pagination but no sorting.
- Product image and verification-document upload flows are missing.

### 4.9 Product details panel

Required endpoints:

- `GET /products/:id`
- `GET /products/:id/summary`
- `GET /products/:id/scan-trends`
- `GET /products/:id/activity`
- `GET /products/:id/suspicious-scans`

Gaps:

- Product detail analytics, activity history, and suspicious scans are missing.
- Activity and suspicious scan collections require filter, sorting, and pagination.

### 4.10 Manage-code batches

Required endpoints:

- `GET /code-batches`
- `POST /code-batches`
- `GET /code-batches/:id`
- `POST /code-batches/:id/cancel` where allowed
- `GET /code-batches/:id/history`
- `POST /code-batches/:id/export-jobs`
- `POST /code-batches/:id/print-jobs`

Required batch list filters:

- `search`
- `productId`
- `labelType`
- `fulfillment`
- `status`
- `createdFrom` and `createdTo`
- `generatedBy`
- `sortBy`
- `sortDirection`
- `page`
- `pageSize`

Gaps:

- Current list returns every matching tenant batch without filtering, sorting, or pagination.
- Export, print, cancellation, fulfilment, and history endpoints are missing.

### 4.11 Code-details screen

Required endpoints:

- `GET /code-batches/:id`
- `GET /code-batches/:id/codes`
- `GET /code-batches/:id/history`
- `POST /codes/:id/suspend`
- `POST /codes/:id/reactivate`

Required code list filters:

- `search`
- `status`
- `activatedFrom` and `activatedTo`
- `verificationCountMin` and `verificationCountMax`
- `sortBy`
- `sortDirection`
- `page`
- `pageSize`

Gaps:

- Current batch detail embeds the complete code collection.
- This must be separated into a paginated collection before production use.
- Code suspension/reactivation, history, secure export, and print operations are missing.
- Activation-code hashes must never be returned by any endpoint.

### 4.12 Generate-code workflow

Required capabilities:

- Paginated active-product picker.
- Server-calculated quotation.
- Fulfilment selection.
- Payment initialization and reconciliation.
- Transactional code generation.
- One-time secure delivery of activation credentials to the authorised fulfilment workflow.
- Job status for large generation requests.
- Batch-to-product linkage enforced by the server.

Required endpoints:

- `GET /products?status=active&...`
- `POST /code-batch-quotes`
- `POST /payments`
- `GET /payments/:id`
- `POST /payments/webhooks/:provider` as a verified public callback
- `POST /code-batches`
- `GET /code-generation-jobs/:id`
- `POST /code-batches/:id/export-jobs`

Gaps:

- Cryptographic generation is implemented.
- Quotation, payment, webhook verification, fulfilment, asynchronous generation, and secure export are missing.
- Prices and totals must always be calculated by the server; client-submitted prices are untrusted.

### 4.13 Reports

Required endpoints should be split by report/read model rather than returning all data in one unbounded response:

- `GET /reports/summary`
- `GET /reports/scan-trends`
- `GET /reports/top-products`
- `GET /reports/batch-funnel`
- `GET /reports/batch-status`
- `GET /reports/verification-breakdown`
- `GET /reports/locations`
- `GET /reports/suspicious-scans`
- `POST /report-export-jobs`

Common report filters:

- `from`
- `to`
- `timeZone`
- `productId`
- `batchId`
- `location`
- `status`
- `sortBy`
- `sortDirection`
- `page`
- `pageSize`

Gaps:

- Current reports endpoint is a placeholder.
- Export jobs, persisted scan data, aggregations, filtering, sorting, and pagination are missing.

### 4.14 Team page and user modals

Required endpoints:

- `GET /team/members`
- `POST /team/invitations`
- `GET /team/members/:id`
- `PATCH /team/members/:id`
- `POST /team/members/:id/deactivate`
- `POST /team/members/:id/reactivate`
- `GET /team/invitations`
- `POST /team/invitations/:id/resend`
- `DELETE /team/invitations/:id`

Required list filters:

- `search`
- `role`
- `status`
- `invitedFrom` and `invitedTo`
- `sortBy`
- `sortDirection`
- `page`
- `pageSize`

Gaps:

- Invite, update, list, and deactivation are partially implemented.
- Get-one, reactivation, invitation administration, permissions, filters, sorting, and pagination are missing.
- `organizationId`, `invitedBy`, and the acting administrator ID must come from JWT.
- Prevent self-deactivation where it would leave the organization without an active administrator.
- Prevent removal or demotion of the final active administrator.

### 4.15 Audit log

Required endpoint:

- `GET /audit-logs`

Required filters:

- `search`
- `actorId`
- `action`
- `resourceType`
- `resourceId`
- `status`
- `from` and `to`
- `sortBy`
- `sortDirection`
- `page`
- `pageSize`

Requirements:

- Audit records are append-only.
- Record JWT actor ID, tenant, action, resource, outcome, correlation ID, timestamp, and safe metadata.
- Never store passwords, OTPs, activation codes, access tokens, refresh tokens, or sensitive document contents.
- Audit writes for critical mutations should participate in the transaction or use a transactional outbox.

Current gap:

- Current endpoint returns a hard-coded empty page.

### 4.16 Settings

Required endpoints:

- `GET /settings/company`
- `PATCH /settings/company`
- `GET /settings/profile`
- `PATCH /settings/profile`
- `POST /settings/password/change`
- `POST /settings/account/deactivate`
- `GET /auth/sessions`
- `DELETE /auth/sessions/:id`

Gaps:

- No settings endpoints exist.
- Profile user ID and company ID must come from JWT.
- Password changes require current-password verification, strong password validation, breach screening where available, session revocation, and an audit event.
- Account deactivation requires explicit authorization and business safeguards.

### 4.17 Notifications panel

Required endpoints:

- `GET /notifications`
- `GET /notifications/unread-count`
- `POST /notifications/:id/read`
- `POST /notifications/read-all`
- `DELETE /notifications/:id`

Required filters:

- `read`
- `type`
- `from` and `to`
- `sortBy`
- `sortDirection`
- `page`
- `pageSize`

Gaps:

- Current endpoint returns an empty collection and unread count.
- Persistence, tenant/user targeting, mutations, filters, sorting, and pagination are missing.

### 4.18 Support, exports, printing, and background jobs

Required capabilities:

- Support-ticket creation and status tracking.
- Asynchronous exports with authorization checks.
- Asynchronous print/fulfilment jobs.
- Time-limited signed result URLs.
- Job state: `queued`, `processing`, `completed`, `failed`, `expired`.

Large generation, export, report, and print requests must not hold an HTTP request open indefinitely. Use a durable queue and transactional outbox.

## 5. Mandatory list endpoint standard

Every endpoint that returns a collection must support filtering, allowlisted sorting, and pagination. This includes nested business collections such as top products, locations, suspicious scans, activity entries, notifications, invitations, code history, report rows, and batch codes.

### Standard query DTO

```text
page: integer, minimum 1, default 1
pageSize: integer, minimum 1, maximum 100, default 20
sortBy: resource-specific allowlisted field
sortDirection: asc | desc, default desc
search: trimmed string with resource-specific maximum length
```

Each resource extends the standard query with typed filters. Unknown query properties must be rejected by the global validation pipe.

### Standard response

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 0,
    "totalPages": 0,
    "hasNextPage": false,
    "hasPreviousPage": false,
    "sortBy": "createdAt",
    "sortDirection": "desc"
  }
}
```

### Rules

- Apply filters before counting and pagination.
- Use deterministic secondary sorting, normally by `id`, to avoid unstable pages.
- Never interpolate arbitrary `sortBy` values into SQL.
- Map public sort keys to allowlisted entity fields.
- Enforce a maximum page size.
- Add indexes supporting tenant scope, common filters, and common sort order.
- Avoid returning unbounded nested collections.
- For very large or frequently changing datasets, assess cursor pagination. If offset pagination is retained, document the consistency trade-off.
- Return an empty page, not `404`, when a valid collection has no rows.

## 6. Validation requirements

- Enable global transformation, whitelist validation, and rejection of unknown properties.
- Create separate DTOs for create, update, query, action, and response contracts.
- Do not reuse database entities as request or response DTOs.
- Validate UUIDs, enums, lengths, formats, numeric ranges, dates, and cross-field rules.
- Trim and normalize email addresses and searchable text intentionally.
- Enforce unique email, registration number, product business keys where required, and 16-digit verification code constraints at database level.
- Use conditional validation for fulfilment, payment, document, and product approval flows.
- Reject client-supplied calculated totals, ownership fields, status transitions, audit fields, or privileged flags.
- Validate state transitions in application/domain services, not controllers.
- Use optimistic concurrency/version fields for editable resources where lost updates are possible.
- Return RFC 9457-style problem details with stable machine-readable error codes.

## 7. Security requirements

### Authentication and abuse controls

- Rate-limit login, OTP, invitation, activation, public verification, password, and export endpoints.
- Use CSPRNGs for OTPs, invitation tokens, verification codes, and activation codes.
- Hash passwords with Argon2id using reviewed parameters.
- Hash or keyed-HMAC secrets that must be compared but not recovered.
- Compare sensitive digests in constant time.
- Configure generic authentication errors to limit account enumeration.
- Add lockout/backoff and security notifications for suspicious authentication behavior.

### Tenant isolation

- Every tenant-owned table includes `organizationId` where appropriate.
- Every repository operation scopes by JWT `organizationId`.
- Add composite indexes beginning with `organizationId` for tenant query paths.
- Add automated cross-tenant authorization tests for every resource.
- Do not rely only on controller guards; repositories and service methods must require tenant context.

### API and data security

- Apply Helmet, strict CORS allowlists, request size limits, and secure proxy settings.
- Do not log secrets, credentials, tokens, OTPs, activation codes, private document URLs, or raw payment data.
- Redact sensitive properties in centralized logging and exception handling.
- Use parameterized ORM operations and allowlisted sorting.
- Encrypt sensitive data at rest where warranted.
- Keep object storage private.
- Verify payment webhook signatures and protect against replay.
- Use idempotency keys for payment, code generation, export, and other retry-prone commands.
- Enforce HTTPS outside local development.
- Maintain dependency scanning, secret scanning, and migration review in CI.

### Verification-code security

- Keep verification codes as strings to preserve all 16 digits and leading zeros.
- Enforce database uniqueness.
- Use Node `crypto.randomInt` or an equivalent operating-system-backed CSPRNG.
- Store only a keyed digest of activation codes unless an approved encrypted recovery requirement exists.
- Never expose activation-code hashes.
- Return raw activation credentials once to an authorised fulfilment flow.
- Audit code generation, export, activation, suspension, and verification anomalies.
- Apply activation attempt limits and suspend after the configured threshold.
- Ensure code generation, batch creation, and product counters are atomic.

## 8. Persistence and transaction requirements

- Use TypeORM for all database access.
- Keep repository interfaces between application services and TypeORM where business logic benefits from abstraction.
- Use explicit migrations; never enable schema synchronization in production.
- Add foreign keys and uniqueness constraints to enforce invariants.
- Use transactions for multi-entity state changes.
- Use pessimistic or optimistic locking where concurrent activation, payment, code generation, or final-admin changes could conflict.
- Use a transactional outbox for email, SMS, notification, payment, and background job messages.
- Ensure migrations work for every officially supported database, or explicitly document per-database migrations and supported versions.

## 9. Testing and quality gates

### Unit tests

- Domain state transitions.
- DTO-independent application services.
- Authorization decisions.
- Cryptographic format and secret comparison.
- Pricing and quotation rules.
- Filter and sort mapping.
- Pagination metadata.
- Error mapping.

### Integration tests

- TypeORM repositories against a real disposable database.
- Migrations up and down where practical.
- Unique constraints and foreign keys.
- Transactions and rollback behavior.
- Concurrent code activation.
- Refresh-token rotation and replay handling.
- Tenant isolation.

### End-to-end tests

- Registration, login, refresh, logout, and session revocation.
- Onboarding draft through submission.
- Product create/read/update/archive/restore/resubmit.
- Secure upload and document deletion.
- Team invite/accept/update/deactivate/reactivate.
- Quote/payment/generate/activate/verify code lifecycle.
- Dashboard and report filters.
- Audit and notification lifecycle.
- Settings and password changes.
- Every list endpoint: filtering, each allowlisted sort key, ascending/descending order, first/middle/last/empty page, maximum page size, invalid query rejection.

### Security tests

- Missing, expired, malformed, wrong-issuer, and wrong-audience JWTs.
- Client attempts to inject `organizationId`, `userId`, `staffId`, role, permissions, or audit fields.
- Cross-tenant resource IDs for every read and mutation.
- Staff attempting administrator-only operations.
- SQL injection strings in search and sort parameters.
- Mass assignment attempts.
- OTP, login, activation, verification, and webhook replay/abuse.
- File type spoofing and oversized files.
- Sensitive-data leakage in errors and responses.

### CI gates

- Formatting and lint pass.
- TypeScript strict build pass.
- Unit, integration, and end-to-end tests pass.
- Coverage thresholds are enforced for critical services.
- Migration validation passes.
- Dependency audit and secret scan pass.
- OpenAPI generation succeeds and contract snapshots are reviewed.

## 10. Delivery order

1. Establish JWT/session, role/permission, current-user, error, audit, and list-query foundations.
2. Fix registration and invitation flows.
3. Complete onboarding and secure uploads.
4. Complete product CRUD and product details read models.
5. Refactor batch/code collection endpoints and complete code lifecycle operations.
6. Add quotation, payment, fulfilment, job, export, and print capabilities.
7. Complete team and invitation lifecycle.
8. Build settings and session management.
9. Persist notifications and audit logs.
10. Build database-backed dashboard and report read models.
11. Connect the UI to typed API clients and remove mock data and `console.info` placeholders.
12. Complete security, load, migration, and end-to-end validation.

## 11. Definition of done

The gap-closing project is complete only when:

- Every routed UI screen has a documented, implemented, and tested API contract.
- Every UI mutation uses a real endpoint and handles success, validation, authorization, conflict, and server errors.
- Every list endpoint has typed filters, allowlisted sorting, bounded pagination, deterministic ordering, and standardized metadata.
- No request DTO accepts vendor ID, organization ID, staff ID, user ID, ownership, role, or permission values that must come from JWT.
- Every tenant-owned database operation is scoped by JWT organization.
- Full product, team, onboarding document, notification, session, and appropriate code-management lifecycle operations exist.
- Dashboard, reports, audit logs, and notifications are database-backed rather than placeholders.
- Uploads, payments, exports, printing, and background jobs follow secure production workflows.
- OpenAPI documentation matches runtime behavior.
- Build, lint, unit, integration, end-to-end, security, and migration checks pass.
- No secrets or sensitive values appear in logs, errors, audit metadata, or unintended response fields.

---

# Senior Developer Implementation Prompt

You are the senior backend engineer responsible for closing all gaps in the goVerifEye NestJS API. Work in the existing `goverifeye-api` project and treat the current React UI and this document as the required product scope.

## Objective

Deliver a production-ready NestJS backend that supports every routed UI screen and modal, provides complete business-appropriate CRUD and lifecycle endpoints, and ensures every collection endpoint supports filtering, allowlisted sorting, and bounded pagination.

## Mandatory identity rule

All authenticated identity and tenant ownership must come from the verified JWT:

- User/vendor administrator/staff ID comes from `sub`.
- Company/vendor tenant comes from `organizationId`.
- Role and permissions come from server-issued claims and current server-side authorization state.
- Session identity comes from `sessionId`.

Never accept or trust `userId`, `staffId`, `vendorId`, `companyId`, `organizationId`, `createdBy`, `updatedBy`, `generatedBy`, `activatedBy`, `invitedBy`, role, or permissions from a request body or query. Remove these fields from writable DTOs. Assign them inside application services from a typed current-user context. Every tenant resource query must include the JWT organization constraint in the database predicate.

## Required approach

1. Read the entire gap analysis above and inventory the current UI routes, forms, tables, filters, modals, and actions.
2. Inventory all existing controllers, DTOs, services, entities, migrations, guards, strategies, and tests.
3. Create an implementation checklist mapping every UI action to an API endpoint and test.
4. Implement shared foundations first:
   - typed JWT principal;
   - access and rotating refresh tokens;
   - global JWT guard and public-route decorator;
   - roles/permissions guards;
   - standardized problem details;
   - validated list-query primitives;
   - standardized paginated responses;
   - correlation IDs and structured logging with redaction;
   - persisted append-only audit events;
   - transactional outbox;
   - idempotency for retry-prone commands.
5. Implement the missing modules and endpoints in the delivery order in this document.
6. Replace placeholder and in-memory behavior with TypeORM repositories and explicit migrations.
7. Keep controllers thin and business rules in application/domain services.
8. Add secure adapters for email, SMS, object storage, payment providers, queues, exports, and printing. Use interfaces so vendors can be replaced.
9. Update Swagger decorators and response DTOs so generated OpenAPI accurately represents validation, authentication, pagination, errors, and response shapes.
10. Wire the UI through a typed API layer and remove mock arrays and `console.info` action placeholders after the backend contracts are stable.

## Collection contract

Every endpoint returning a list must implement:

- resource-specific typed filters;
- `page` and `pageSize` with defaults and maximum size;
- allowlisted `sortBy`;
- `sortDirection` restricted to `asc|desc`;
- deterministic secondary ordering;
- total count and complete page metadata;
- JWT tenant scoping;
- tests for filtering, sorting, pagination, invalid input, and cross-tenant access.

Do not embed unbounded lists inside detail responses. Create separate paginated endpoints for batch codes, activity, suspicious scans, locations, top products, invitations, history, notifications, and report rows.

## Validation requirements

- Use strict class-validator DTOs with transformation, whitelist enforcement, and rejection of unknown fields.
- Separate create, update, query, action, and response DTOs.
- Validate formats, lengths, UUIDs, enums, ranges, dates, conditional fields, and cross-field rules.
- Reject mass assignment and client-controlled state transitions.
- Use versioning or explicit concurrency controls for editable resources.
- Calculate prices, totals, statuses, ownership, and audit fields on the server.

## Security requirements

- Use Argon2id for passwords.
- Use operating-system-backed CSPRNGs for OTPs, tokens, verification codes, and activation secrets.
- Hash or HMAC non-recoverable secrets and use constant-time comparison.
- Rotate refresh tokens and detect replay.
- Rate-limit authentication, OTP, invitation, activation, public verification, password, webhook, and export operations.
- Verify payment webhook signatures and replay protection.
- Enforce strict CORS, Helmet, HTTPS, body limits, file limits, private storage, MIME/signature validation, and malware scanning.
- Never expose password hashes, activation hashes, OTP hashes, token hashes, private storage keys, or sensitive audit metadata.
- Add automated tenant-isolation and authorization tests for every resource.

## Verification-code invariants

- A company owns products through JWT `organizationId`.
- A product owns batches; a batch owns verification codes.
- Generation is allowed only for an active product in the caller's tenant.
- Each verification code is exactly 16 numeric characters and globally unique.
- Each verification code has a separate activation secret.
- Activation secrets are returned only through an authorised one-time fulfilment result and stored only as secure keyed digests.
- Generation, batch persistence, code persistence, and product counts are transactional.
- Failed activation attempts are counted and codes are suspended at the configured threshold.
- Public verification succeeds only for active codes attached to active products.
- Activation, verification, suspension, export, and abnormal behavior are audited without recording secrets.

## Required verification

Before considering the work complete:

1. Run formatting and linting.
2. Run the strict NestJS build.
3. Run unit tests.
4. Run repository integration tests against a disposable real database.
5. Run migrations from an empty database and from the previous schema version.
6. Run end-to-end tests for every UI workflow.
7. Run list contract tests for every collection.
8. Run authorization and cross-tenant security tests.
9. Run file upload and payment webhook security tests.
10. Inspect generated OpenAPI documentation.
11. Confirm no UI mock data or console-only actions remain for supported workflows.
12. Provide a final endpoint matrix, migration summary, test results, remaining risks, and deployment/configuration notes.

Do not mark the project complete while any routed UI action lacks a real API, any list is unbounded or lacks filter/sort/page behavior, any tenant identifier is accepted from the client, any placeholder response remains, or any required security test is failing.
