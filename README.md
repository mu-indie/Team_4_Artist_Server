# Artist API Server

## Overview

The Artist API is a JSON REST API for an artist-booking platform. It lets the platform's frontend and other clients browse artists, songs, artist and venue profiles, and bookings, as well as create and manage users and those records. The API uses Express and MySQL.

## Authentication

The public `GET /api/health` deployment check requires no credentials. Requests from the exact configured `FRONTEND_ORIGIN` or `http://localhost:5173` may call the API without a shared key; login and signup are public, while all other browser API requests require a per-user bearer token in `Authorization` and are rate-limited per client IP. Requests from other clients require an API key in `X-API-Key`; account, booking, and owned-resource operations also require the user bearer token. Requests with a body should set `Content-Type: application/json`. The API has two independently configured consumers: `API_KEY_DEVELOPMENT` for the development/testing team and `API_KEY_PARTNER` for the ring partner. Keys and bearer tokens are never written to application logs. An Origin/CORS allowlist is not a substitute for authentication; protected browser routes still verify the signed bearer token.

An API key authenticates a consumer application; it does not identify a user. `POST /api/users/login` checks the user's credentials and returns a signed bearer token that expires after one hour. Use both headers for owner-scoped operations:

```sh
curl -i \
  -H "X-API-Key: $API_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  http://localhost:5001/api/users/1
```

Tokens are signed with `USER_TOKEN_SECRET`. The database-backed user routes return only the authenticated user's record; cross-user IDs return `404`. Artist profile, song, venue, and booking writes are restricted to the matching user and role. Artist, song, and venue listings remain readable by trusted API-key consumers. Artist create/update/delete operations require an artist token but remain disabled until existing artist records are mapped to verified owners and database-backed ownership authorization tests pass.

Generate independent cryptographically secure values and store them privately:

```sh
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

Set the outputs as `API_KEY_DEVELOPMENT`, `API_KEY_PARTNER`, and `USER_TOKEN_SECRET` in local `.env` or the hosting platform's secret settings. The two API keys must be different. Rotate/revoke consumer keys by replacing/removing the environment value and restarting/redeploying. Rotating `USER_TOKEN_SECRET` invalidates all existing user tokens. Do not send keys in email/chat, source control, or a frontend build.

Example authenticated request (set `API_KEY` to a configured value in your shell without adding it to a command committed to source control):

```sh
curl -i -H "X-API-Key: $API_KEY" http://localhost:5001/api/artists
```

A missing or invalid key returns HTTP `401`:

```json
{"message":"Missing or invalid API key"}
```

Each consumer has its own in-memory fixed-window quota: 100 requests per 60 seconds by default. A request over quota returns HTTP `429`, a JSON `retryAfter` value in seconds, and a matching `Retry-After` header. The limit can be temporarily set to three with `RATE_LIMIT_MAX_REQUESTS=3`; restore it to `100` after the demonstration. The limiter is per process and is not shared across multiple workers or instances, so a shared store is required for reliable production-wide quotas in a multi-instance deployment.

The React frontend is a static Vite application and must never contain either shared API key. It makes direct requests to `/api` at the deployed service; requests from the configured frontend origin are accepted without a shared key and rate-limited per client IP. CORS is a browser policy, not authentication: login and signup are public endpoints, and every other browser API operation requires the short-lived user bearer token returned by login. The server still requires `X-API-Key` for API callers without an allowed browser origin. Set `FRONTEND_ORIGIN` on the API service to the exact deployed frontend origin (scheme and host, no path or trailing slash). The API also allows `http://localhost:5173` for local development; it does not allow wildcard origins. CORS permits credentials and the `Content-Type`, `Authorization`, and `X-API-Key` headers, and handles preflight `OPTIONS` requests. The frontend defaults to `https://artist-api-server.onrender.com/api`; set `VITE_API_BASE_URL` in the frontend build environment only when using a different API URL (for example, `http://localhost:5001/api` for an explicitly local backend). The frontend does not connect directly to MySQL or include database/API-key credentials.

## Monitoring stats

`GET /stats` returns in-memory request totals, error counts, response-time averages, and per-route counts. It requires a valid `X-API-Key`; a missing or invalid key receives `401`. Route totals are grouped by Express route pattern, and the endpoint reports only 5xx responses in `errorRatePercent`.

```sh
curl -H 'X-API-Key: <your-api-key>' http://localhost:5001/stats
```

Example response shape immediately after startup (the uptime and start time vary):

```json
{
  "startedAt": "<server start time>",
  "uptimeSeconds": 0,
  "total": 0,
  "clientErrors": 0,
  "serverErrors": 0,
  "errorRatePercent": 0,
  "avgMs": 0,
  "routes": {}
}
```

## Endpoint examples

The deployed API base URL is `https://artist-api-server.onrender.com`. All paths below use the `/api` prefix. Successful `GET` requests return JSON. Successful `POST` requests generally return `201 Created`; successful `PUT` requests return JSON with `200 OK`; successful `DELETE` requests return an empty `204 No Content` response.

| Resource | Routes |
| --- | --- |
| Health | `GET /api/health` |
| Monitoring stats | `GET /stats` (API key required) |
| Upcoming tasks | `GET /api/upcoming` (partner-backed) |
| Artists | Public-to-API-key-consumers `GET /api/artists` and `GET /api/artists/:id` (no user token required); all writes return `403` |
| Songs | Public `GET /api/songs` and `GET /api/songs/:id`; artist-owner token required for `POST`, `PUT`, and `DELETE` |
| Users | `POST /api/users` (register); `POST /api/users/login`; `GET /api/users` (current user only); `GET, PUT, DELETE /api/users/:id` (owner token required) |
| Artist profiles | `GET /api/profiles/artists`; `GET /api/profiles/artists/:userId`; owner artist token required for `PUT, DELETE` |
| Bookings | Owner token required for collection and item `GET`, `POST`, `PUT`, and `DELETE` |
| Venue profiles | Public `GET /api/venues` and `GET /api/venues/:id`; owner venue token required for `POST`, `PUT`, and `DELETE` |

Each venue account can own multiple venue profiles. On an existing database, run
`npm run migrate:multiple-venue-profiles` once to replace the unique owner index
with a normal lookup index. The migration preserves all venue records and keeps
the foreign-key relationship to users.

Artist records are being prepared for an artist-owner relationship through the nullable `artists.owner_user_id` foreign key. The migration command adds the relationship structure but does not guess owners for existing records. Assign owners only from verified data. Artist create/update/delete endpoints remain disabled until ownership mapping, authorization, and database-backed tests are complete.

Artist profile `location` values are up to four comma-separated unique county
names selected from the 47 supported Kenyan counties (for example,
`Nairobi, Nakuru, Narok`). The existing `VARCHAR(255)` column can store this
format; no database migration is required.

The venue dashboard's upcoming-task panel loads directly from `GET /api/upcoming`, which remains sourced from the partner API configured by `PARTNER_URL` and `PARTNER_API_KEY`. The Artisans tab loads live data directly from `GET /api/artisans`, sourced from the partner API configured by `ARTISANS_API_URL` and `ARTISANS_API_KEY`. Both browser requests require a user bearer token. If a partner service is unavailable or returns an error, the API stays running and responds with HTTP `502`. The server logs upstream failures, including connection error codes such as `ECONNREFUSED`. Reopen the Artisans tab or reload the dashboard after the service restarts to fetch live data again.

### Render production configuration

Configure these values in the Render web service's Environment settings. `FRONTEND_ORIGIN` is a placeholder until you enter the exact origin shown in the deployed React app's browser address bar (for example, `https://your-frontend.example`, without a path or trailing slash). Do not use the API's own Render URL unless the React frontend is actually hosted there.

| Variable | Purpose |
| --- | --- |
| `FRONTEND_ORIGIN` | Exact deployed frontend origin; `http://localhost:5173` is separately allowed for local development |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Existing Railway MySQL connection; preserve the current working values |
| `API_KEY_DEVELOPMENT`, `API_KEY_PARTNER`, `USER_TOKEN_SECRET` | Existing server-side API and user-token secrets; keep their configured values |
| `PARTNER_URL`, `PARTNER_API_KEY` | Upcoming-task partner integration |
| `ARTISANS_API_URL`, `ARTISANS_API_KEY` | Artisans partner integration |

Never put database credentials, API keys, or the token secret in frontend `VITE_*` variables.

The server also mounts artist routes at `/artists` and user routes at `/users` without the `/api` prefix. Use the `/api` paths for new clients.

### Most important endpoint command

List artists from the deployed API:

```sh
curl -H "X-API-Key: $API_KEY" https://artist-api-server.onrender.com/api/artists
```

Previously captured response shape (the deployed endpoint must be called with a valid key after authentication is configured):

```json
[{"id":4,"name":"Ben","genre":"Afrobeats","bio":"hi"},{"id":2,"name":"Night Echo","genre":"Indie","bio":"Alternative musician"},{"id":1,"name":"Ariana Blue","genre":"Pop","bio":"Singer-songwriter"}]
```

### Other endpoint examples

These requests and response bodies were captured from the deployed API connected to Railway. Collection contents can change as records are added or updated.

Health and database connectivity:

```sh
curl https://artist-api-server.onrender.com/api/health
```

```json
{"api":"ok","database":"connected"}
```

List songs:

```sh
curl -H "X-API-Key: $API_KEY" https://artist-api-server.onrender.com/api/songs
```

```json
[
  {"id":3,"artistId":10,"title":"dream","genre":"jazz","description":"sasakopsak","audioUrl":"ekwmemw","coverImage":"ewewew","uploadDate":"2026-09-08T00:00:00.000Z","createdAt":"2026-09-08T23:03:47.000Z"},
  {"id":1,"artistId":1,"title":"City Lights","genre":"Afrobeats","description":"A vibrant city anthem with a warm melodic hook.","audioUrl":"https://example.com/audio/city-lights.mp3","coverImage":"https://example.com/images/city-lights.jpg","uploadDate":"2026-09-01T00:00:00.000Z","createdAt":"2026-09-08T17:28:13.000Z"},
  {"id":2,"artistId":1,"title":"Midnight Drive","genre":"R&B","description":"Smooth late-night groove for intimate settings.","audioUrl":"https://example.com/audio/midnight-drive.mp3","coverImage":"https://example.com/images/midnight-drive.jpg","uploadDate":"2026-09-04T00:00:00.000Z","createdAt":"2026-09-08T17:28:13.000Z"}
]
```

List artist profiles:

```sh
curl -H "X-API-Key: $API_KEY" https://artist-api-server.onrender.com/api/profiles/artists
```

```json
[
  {"id":2,"userId":10,"stageName":"Moses","genre":"jazz","bio":"eijdjeij","location":"Kena","performanceFee":"200.00","profileImage":"iojeiw","instagram":"werwer","youtube":"ewfwe","spotify":"rewrew","socialLinks":{"instagram":"werwer","youtube":"ewfwe","spotify":"rewrew"}},
  {"id":1,"userId":1,"stageName":"John Artist","genre":"Afrobeats","bio":"Upcoming artist from Nairobi.","location":"Nairobi","performanceFee":"500.00","profileImage":"","instagram":"","youtube":"","spotify":"","socialLinks":{"instagram":"","youtube":"","spotify":""}}
]
```

List bookings:

```sh
curl -H "X-API-Key: $API_KEY" \
  -H "Authorization: Bearer $USER_TOKEN" \
  https://artist-api-server.onrender.com/api/bookings
```

```json
[{"id":1,"artistId":1,"venueId":3,"eventDate":"2026-09-15T00:00:00.000Z","offeredFee":"1200.00","status":"Pending","notes":"Scheduled for a live showcase night.","createdAt":"2026-09-08T17:28:13.000Z"}]
```

List venue profiles:

```sh
curl -H "X-API-Key: $API_KEY" https://artist-api-server.onrender.com/api/venues
```

```json
[{"id":1,"userId":3,"venueName":"Royal Arena","location":"Nairobi","capacity":1200,"supportedGenres":"Afrobeats,R&B,Pop","description":"Large venue for concerts and live performances.","createdAt":"2026-09-08T17:28:13.000Z","updatedAt":"2026-09-08T17:28:13.000Z"}]
```

Register a user with `POST /api/users` using JSON fields `name`, `email`, `password`, and `role`. A successful response has status `201` and returns `id`, `name`, `email`, and `role` (not the password). The role is set at registration and cannot be changed with `PUT /api/users/:id`. To create an artist, song, booking, or venue profile, send a JSON object with the fields used by that resource; the route table above shows the collection and item paths.

After registration, log in with the API key to receive the owner token:

```sh
curl -i -X POST http://localhost:5001/api/users/login \
  -H "X-API-Key: $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"<your-password>"}'
```

The successful login body includes `accessToken` and `expiresIn` (seconds). Keep the token private and send it as a bearer token only to owner-scoped routes.

## Error format

Handled resource errors use a JSON object with an `error` string. Authentication errors use `message`; rate-limit errors include `message` and `retryAfter`. The HTTP status indicates the failure type. For example, requesting a missing artist:

```sh
curl -i -H "X-API-Key: $API_KEY" https://artist-api-server.onrender.com/api/artists/999999
```

```http
HTTP/2 404
Content-Type: application/json; charset=utf-8

{"error":"Artist not found."}
```

Invalid login credentials return `401 Unauthorized`:

```sh
curl -i -X POST https://artist-api-server.onrender.com/api/users/login \
  -H "X-API-Key: $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"email":"not-a-user@example.invalid","password":"invalid"}'
```

```http
HTTP/2 401
Content-Type: application/json; charset=utf-8

{"error":"Invalid email or password."}
```

Other handled failures include `400` for invalid user input, `404` for missing records, `409` when registering an already-used email, and `500` with a resource-specific error when a database operation fails. Unknown paths return a JSON 404 response.

Missing/invalid API keys return `401` with `{"message":"Missing or invalid API key"}`. Missing/expired user tokens on owner-scoped routes return `401`; wrong-role writes return `403`. Cross-user record IDs return `404` to avoid disclosing whether another user's record exists. Artist-table writes return `403` until the owner relationship and authorization are verified. Artist reads are public to API-key-authenticated consumers and do not require a user bearer token.

## Local setup

Prerequisites: Node.js with npm, and a reachable MySQL server. The database must contain the tables expected by the routes: `artists`, `songs`, `users`, `artist_profiles`, `bookings`, and `venue_profiles`. The `schema.sql` file creates these tables without inserting sample data, including the nullable artist-owner relationship for new databases.

From the cloned server repository root:

```sh
npm ci
cp .env.example .env
```

Edit `.env` and set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` to a reachable MySQL database. Replace both API-key placeholders and the user-token secret placeholder with independent outputs from `openssl rand -hex 32`. `PORT` defaults to `5001` in `.env.example`; `FRONTEND_ORIGIN` adds the exact deployed frontend origin to CORS, while `http://localhost:5173` is always allowed for local development. These example commands create a local database and import the schema; change the host, user, or database name to match `.env` if needed:

```sh
mysql --host=127.0.0.1 --port=3306 --user=root --password -e 'CREATE DATABASE IF NOT EXISTS artist_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;'
mysql --host=127.0.0.1 --port=3306 --user=root --password artist_platform < schema.sql
```

Then start the API:

```sh
npm start
```

In another terminal, verify the connection:

```sh
curl http://localhost:5001/api/health
```

The expected response with a working database is `{"api":"ok","database":"connected"}`. Import `schema.sql` into the configured database before expecting data routes to work. It creates the six tables but does not add any records. For an existing database, take a protected backup and apply the artist ownership migration explicitly:

```sh
npm run migrate:artist-ownership
```

The migration is idempotent and only adds the nullable `owner_user_id` column, index, and foreign key. It leaves existing artist records unowned; map them to verified artist accounts before considering write authorization. Writes stay disabled until that mapping and the ownership checks pass database-backed tests. The server may still start without a reachable database, but data operations will return `500` and health will report `503`.

To allow a venue account to create multiple venue profiles in an existing
database, first take a protected backup and then run
`npm run migrate:multiple-venue-profiles` against the configured database. This
preserves profile rows, adds a non-unique `user_id` index for the foreign key,
and removes only standalone unique indexes on that column. It fails for manual
review if it encounters an unexpected composite unique index.


The booking-request workflow stores new requests as `Pending`. Artist acceptance changes the status to `Accepted`; declining deletes the booking row. The schema's existing status enum supports this flow without a database migration. The optional migration below is only for legacy databases requiring the newer `Confirmed`/`Declined`/`Cancelled` lifecycle; it is not required for pending/accepted requests.

```sh
npm run migrate:booking-statuses
```

The migration maps `Accepted` to `Confirmed` and `Rejected` to `Declined`, adds `Cancelled`, preserves `Completed`, and adds a nullable booking-initiator column. Existing initiators are left unknown because they cannot be inferred safely; only verified data should be used to map them. It is safe to rerun. For local development with automatic restarts, run `npm run dev` instead of `npm start`.

## Rate-limit demonstration

Temporarily set `RATE_LIMIT_MAX_REQUESTS=3` in `.env` and restart the API. In a separate terminal, set `API_KEY` to one valid configured key and run:

```sh
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -w "%{http_code} " \
    -H "X-API-Key: $API_KEY" \
    http://localhost:5001/
done
echo
```

The expected statuses are `200 200 200 429 429`. To inspect the response details, send a fourth request during the same minute with `curl -i -H "X-API-Key: $API_KEY" http://localhost:5001/`; it should show `Retry-After` and a JSON body such as `{"message":"Too many requests","retryAfter":42}`. The actual retry count depends on when in the fixed window the request is made. Restore `RATE_LIMIT_MAX_REQUESTS=100` and restart the API after the demonstration.

## Tests and password storage

Run the Jest/Supertest API suite with:

```sh
npm test
```

The HTTP tests use an in-memory database adapter and local integration servers, so they do not write to the configured MySQL database. The previous `node:test` suite remains available with:

```sh
npm run test:legacy
```

New and changed account passwords are stored as scrypt hashes. Existing plaintext passwords are upgraded after a successful login. To migrate all legacy rows at once, use the transaction-based command below; take a protected backup and schedule maintenance first. User response queries explicitly omit password fields.

To hash all legacy account passwords in the configured database in one transaction, first take a protected backup and schedule a maintenance window, then run:

```sh
npm run migrate:passwords
```

The script prints only the number of records migrated, never password values. It is not run automatically during startup. After verifying the migration, securely retire any backups that contain plaintext passwords.