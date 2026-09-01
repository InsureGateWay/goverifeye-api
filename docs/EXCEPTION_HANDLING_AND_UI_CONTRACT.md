# Exception handling and Admin Audit Exceptions contract

## Runtime behavior

- The global exception filter catches handled and unhandled HTTP request exceptions.
- Client/domain failures retain their appropriate 4xx status.
- Unexpected 5xx-class failures are returned to clients as a generic `503 SERVICE_TEMPORARILY_UNAVAILABLE` problem response.
- Internal messages and stack traces are never returned to the caller.
- Every caught exception is written to `audit_exceptions` with severity, correlation ID, original status, error code, method, path, actor/organization when authenticated, and redacted diagnostic details.
- Query strings and request bodies are not stored because they may contain credentials, OTPs, tokens, or personal data.
- If PostgreSQL itself is unavailable, persistence to PostgreSQL is impossible; that failure is emitted as a structured `http.exception.persistence_failed` application log while the caller still receives the safe response.

## UI-compatible platform-admin API

`GET /api/v1/platform/audit-exceptions`

Supported query parameters match `AdminAuditExceptionListParams` in the frontend:

- `query`
- `severity=high|medium|low|all`
- `status=open|closed|all`
- `page`
- `pageSize`

The response preserves the UI shape:

```json
{
  "items": [
    {
      "id": "uuid",
      "exception": "Unexpected API failure: Error",
      "severity": "high",
      "age": "2m",
      "ageLabel": "2026-09-01T07:00:00.000Z",
      "status": "open",
      "closure": null
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 10,
  "totalPages": 1
}
```

Additional diagnostic fields are included for future UI expansion and do not break the current TypeScript model: `kind`, `correlationId`, `requestMethod`, `requestPath`, `originalStatus`, `errorCode`, and `details`.

`POST /api/v1/platform/audit-exceptions/:id/close`

```json
{
  "comment": "Root cause corrected and regression test added",
  "evidenceFileName": "incident-report.pdf",
  "evidenceUrl": "https://optional-signed-evidence-url"
}
```

Both routes require the `platform_admin` role.

## Confirmed frontend state

The current Admin Audit Exceptions screen has the correct row, paging, severity, status, and closure models, but its production branch still returns in-memory mock data. It does not yet call these backend routes. No frontend files were changed as part of this backend hardening.
