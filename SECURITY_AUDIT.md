# Security Audit

**Scope:** Express/MySQL API in this repository, including `index.js`, all six routers and their mounted aliases, `db.js`, `schema.sql`, environment/deployment files, README, and the static React API caller in the adjacent `Team-4--Artist-platform` project. All route handlers and mounted aliases were reviewed. The API had no OpenAPI file or runnable test suite before this work.

## A. Sensitive information exposure

- **Inspected:** User registration, login, list, lookup, and update responses in `routes/users.js`; response queries and serializers in all other route files; database columns in `schema.sql`.
- **Found:** User responses included email and role; passwords were stored as plaintext and legacy values were directly compared at login.
- **Fixed:** Registration and password changes store scrypt hashes; successful login upgrades a legacy plaintext value. Login returns a one-hour signed access token but excludes the stored password. Existing user lookup now returns only the authenticated user's record.
- **Unresolved:** Existing plaintext database values remain until login migration or the one-time migration script is run. The script was not run against the configured database because a protected backup and explicit approval to mutate database contents were not established. Existing backups may also contain plaintext passwords; securely retire them after migration. Email exposure remains intentional for the authenticated user.
- **Verification:** Password hashing, verification, wrong-password rejection, malformed-hash handling, and legacy upgrade behavior are covered by automated unit tests. Response projection was checked in the user routes.

## B. Unauthorized access to other users' records

- **Inspected:** ID-based read/update/delete operations for users, profiles, bookings, songs, artists, and venues, including `userId`, `artistId`, and `venueId` fields and the related foreign keys in `schema.sql`.
- **Found:** API keys identified consumers, not users; ID-based routes had no caller-to-owner checks.
- **Fixed:** Login now issues signed, one-hour bearer tokens. User account reads/updates/deletes are self-only; booking reads/writes are scoped to either participant; song writes require the owning artist; artist and venue profile writes require the matching user and role; venue writes are scoped by `user_id`. Artist reads are available to API-key consumers without a user bearer token. Artist writes remain disabled.
- **Unresolved:** The artist-owner migration adds a nullable owner reference but does not infer owners for existing records. Writes must remain disabled until existing records are mapped from verified data and owner-scoped handlers pass database-backed authorization tests. Existing bookings also have unknown initiators after migration, so they cannot be confirmed or declined until initiators are mapped from verified data. A token remains valid until its one-hour expiry unless `USER_TOKEN_SECRET` is rotated.
- **Verification:** Unit tests confirm token signatures, expiration, tamper rejection, owner mismatch, role rejection, and handler bypass. Route SQL includes owner predicates on update/delete operations. No DB-backed integration test was run; an isolated test database was not verified.

## C. Error-message exposure

- **Inspected:** Route-level database error handlers, health-check handling, JSON parsing, unknown paths, and the global error handler in `index.js`.
- **Found:** Route errors returned static messages rather than SQL or stack traces, but handlers logged whole database error objects to server logs.
- **Fixed:** Database error logs now include only operation context and an error code/name, not the underlying error object. The health check hides database diagnostics, malformed JSON and unknown paths return JSON errors, and unhandled errors return a generic `500` response.
- **Unresolved:** No production log-retention or hosting-access policy was available to inspect.
- **Verification:** Source review confirmed no route returns the raw error object or stack. Authentication and malformed-request handling use generic response bodies.

## D. Unsafe write operations

- **Inspected:** All `POST`, `PUT`, and `DELETE` handlers in the six route files and their SQL statements.
- **Found:** Handlers use explicit field selection and SQL placeholders, but had no user identity to authorize ownership-sensitive fields. Song create/update responses used `SELECT *`, making response fields depend on future schema additions.
- **Fixed:** User role is immutable after registration; unknown user fields remain ignored. User, profile, song, venue, and booking writes now require a token with matching user/role ownership. Song responses now use an explicit field projection. Artist writes remain disabled pending the owner migration, verified ownership mapping, and database-backed tests.
- **Unresolved:** Several resource handlers still rely on database constraints rather than comprehensive request schemas for every field. No database-backed write test was run because an isolated test database was not verified.
- **Fixed:** Booking participant IDs are immutable after creation. New bookings start as `Pending`; only the invited participant may confirm or decline, either participant may cancel, and declined/cancelled/completed bookings cannot be reopened. Legacy statuses have an idempotent migration.
- **Verification:** Reviewed handler field selection, SQL parameterization, owner predicates, and status transitions. Automated HTTP tests cover booking creation, invitation-role checks, participant immutability, cancellation, and terminal-state enforcement.

## E. Secret exposure and repository hygiene

- **Inspected:** `.gitignore`, `.env.example`, local `.env` metadata (values were not displayed), current working-tree files, tracked Git history, README, OpenAPI spec, source, and test fixtures.
- **Found:** `.env` is ignored and not tracked. `.env.example` contains invalid placeholder strings only. The local `.env` contains locally generated API keys and a user-token signing secret, is mode `0600`, and remains ignored; secret values were not printed. A credential-like value was also present in the IDE-selected text shared with this review; treat the corresponding credential as potentially exposed and rotate it privately. A targeted scan of tracked history for private-key headers, common AWS/GitHub token formats, and 64-character hexadecimal strings found no matching files. Historical environment-file paths contained `.env.example` but not `.env`.
- **Fixed:** Environment examples and deployment configuration now require separate development and partner API keys plus a user-token signing secret. No real key is present in committed source or documentation.
- **Unresolved:** The history check was a targeted pattern scan, not a guarantee that every possible credential format is absent. No dedicated secret-scanning product was run. The credential shown in the IDE selection must be rotated in every environment where it is configured, and the ring partner must be notified if it was their key.
- **Verification:** `git check-ignore` confirmed `.env` is ignored; `git ls-files` confirmed `.env` is untracked. The targeted current-tree and history scans did not identify committed secret-like values.

## Authentication, rate limiting, and documentation checks

- API-key validation is centralized before route registration. `GET /api/health` is the sole public exception for the hosting health check; it is also not rate-limited. The static frontend proxy injects the server-side development key, permits anonymous login/signup/health only, and requires a valid user token for every other proxied operation.
- Development and ring-partner keys must be distinct, 64-character hexadecimal values from `API_KEY_DEVELOPMENT` and `API_KEY_PARTNER`. `USER_TOKEN_SECRET` independently signs one-hour user tokens. Credentials are not included in logs or API error responses.
- Per-consumer in-memory rate limiting defaults to 100 requests per 60 seconds, chosen to accommodate normal interactive and partner-integration use while limiting runaway loops. It returns HTTP 429 with JSON `message`/`retryAfter` plus the `Retry-After` header. The counter is process-local and is not a reliable shared quota across multiple workers or instances.
- `openapi.yaml` declares global API-key auth, bearer auth on owner-scoped operations, 401/403/429 responses, `Retry-After`, and the explicit public health-check exception.
- Nineteen automated tests passed, including API and user-token authentication, proxy authorization, owner/role guards, booking lifecycle checks, independent consumer quotas, 429 headers/body, and password hashing. The repository previously had no runnable Week 7 suite; these are new Node built-in tests. No database integration tests were run.
- A genuine local HTTP demonstration against the Express application returned `200 200 200 429 429`; the 429 response included `Retry-After: 60` and `{"message":"Too many requests","retryAfter":60}`. The default configuration remains 100 requests per 60 seconds.

## Deployment and frontend limitations

`render.yaml` now declares the two API keys and user-token signing secret as unsynchronized secrets. Configure them in the hosting dashboard before deploying; startup intentionally fails when required keys or token-signing configuration are absent or invalid.

The adjacent React app is a static Vite build with no server-side runtime. Its direct browser requests cannot safely contain a shared API key. It uses the backend `/client-api` proxy, which keeps the shared key server-side and requires a user token for all proxied operations except login, signup, and the public health check. No key was added to browser code.

The one-time `npm run migrate:passwords` script is available to hash all legacy plaintext rows transactionally. It was not run because no protected backup or explicit database-mutation approval was established. Existing backups containing plaintext values also require secure retirement.
