# Artist API Server

## Overview

The Artist API is a JSON REST API for an artist-booking platform. It lets the platform's frontend and other clients browse artists, songs, artist and venue profiles, and bookings, as well as create and manage users and those records. The API uses Express and MySQL.

## Base URL

By default, the API listens at `http://localhost:5001` when using the checked-in `.env.example`. The port can be changed with `PORT`. The preferred paths start with `/api`.

## Authentication
To check credentials, send a JSON `POST` to `/api/users/login` with `email` and `password` fields. A successful login returns the user's `id`, `name`, `email`, and `role`; it does not issue a token, so it does not authenticate subsequent requests. The current implementation compares the submitted password directly with the database value. Do not use real passwords until password hashing and access control are implemented.

No `Authorization` header is required. Requests with a body should set `Content-Type: application/json`.

## Endpoints

All paths below are relative to the base URL. Successful `GET` requests return JSON. Successful `POST` requests generally return `201 Created`; successful `PUT` requests return JSON with `200 OK`; successful `DELETE` requests return an empty `204 No Content` response.

| Resource | Routes |
| --- | --- |
| Health | `GET /api/health` |
| Artists | `GET, POST /api/artists`; `GET, PUT, DELETE /api/artists/:id` |
| Songs | `GET, POST /api/songs`; `GET, PUT, DELETE /api/songs/:id` |
| Users | `POST /api/users` (register); `POST /api/users/login`; `GET /api/users`; `GET, PUT, DELETE /api/users/:id` |
| Artist profiles | `GET /api/profiles/artists`; `GET, PUT, DELETE /api/profiles/artists/:userId` |
| Bookings | `GET, POST /api/bookings`; `GET, PUT, DELETE /api/bookings/:id` |
| Venue profiles | `GET, POST /api/venues`; `GET, PUT, DELETE /api/venues/:id` |

The server also mounts artist routes at `/artists` and user routes at `/users` without the `/api` prefix. Use the `/api` paths for new clients.

### Copy-and-paste request

List artists from a locally running server:

```sh
curl http://localhost:5001/api/artists
```

This exact command was run against the local server. It returned HTTP `200` and this JSON:

```json
[{"id":4,"name":"Ben","genre":"Afrobeats","bio":"hi"},{"id":2,"name":"Night Echo\n","genre":"Indie","bio":"Alternative musician"},{"id":1,"name":"Ariana Blue","genre":"Pop","bio":"Singer-songwriter"}]
```

### Live endpoint examples

These requests and response bodies were captured from the running local API. Collection contents depend on the connected database.

Health and database connectivity:

```http
GET /api/health
```

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"api":"ok","database":"connected"}
```

List songs:

```http
GET /api/songs
```

```json
[
  {"id":3,"artistId":10,"title":"dream","genre":"jazz","description":"sasakopsak","audioUrl":"ekwmemw","coverImage":"ewewew","uploadDate":"2026-09-07T21:00:00.000Z","createdAt":"2026-09-08T23:03:47.000Z"},
  {"id":1,"artistId":1,"title":"City Lights","genre":"Afrobeats","description":"A vibrant city anthem with a warm melodic hook.","audioUrl":"https://example.com/audio/city-lights.mp3","coverImage":"https://example.com/images/city-lights.jpg","uploadDate":"2026-08-31T21:00:00.000Z","createdAt":"2026-09-08T17:28:13.000Z"},
  {"id":2,"artistId":1,"title":"Midnight Drive","genre":"R&B","description":"Smooth late-night groove for intimate settings.","audioUrl":"https://example.com/audio/midnight-drive.mp3","coverImage":"https://example.com/images/midnight-drive.jpg","uploadDate":"2026-09-03T21:00:00.000Z","createdAt":"2026-09-08T17:28:13.000Z"}
]
```

List artist profiles:

```http
GET /api/profiles/artists
```

```json
[
  {"id":2,"userId":10,"stageName":"Moses","genre":"jazz","bio":"eijdjeij","location":"Kena","performanceFee":"200.00","profileImage":"iojeiw","instagram":"werwer","youtube":"ewfwe","spotify":"rewrew","socialLinks":{"instagram":"werwer","youtube":"ewfwe","spotify":"rewrew"}},
  {"id":1,"userId":1,"stageName":"John Artist","genre":"Afrobeats","bio":"Upcoming artist from Nairobi.","location":"Nairobi","performanceFee":"500.00","profileImage":"","instagram":"","youtube":"","spotify":"","socialLinks":{"instagram":"","youtube":"","spotify":""}}
]
```

List bookings:

```http
GET /api/bookings
```

```json
[{"id":1,"artistId":1,"venueId":3,"eventDate":"2026-09-14T21:00:00.000Z","offeredFee":"1200.00","status":"Pending","notes":"Scheduled for a live showcase night.","createdAt":"2026-09-08T17:28:13.000Z"}]
```

List venue profiles:

```http
GET /api/venues
```

```json
[{"id":1,"userId":3,"venueName":"Royal Arena","location":"Nairobi","capacity":1200,"supportedGenres":"Afrobeats,R&B,Pop","description":"Large venue for concerts and live performances.","createdAt":"2026-09-08T17:28:13.000Z","updatedAt":"2026-09-08T17:28:13.000Z"}]
```

Register a user with `POST /api/users` using JSON fields `name`, `email`, `password`, and `role`. A successful response has status `201` and returns `id`, `name`, `email`, and `role` (not the password). To create an artist, song, booking, or venue profile, send a JSON object with the fields used by that resource; the route table above shows the collection and item paths.

## Errors

Handled API errors use a JSON object with an `error` string. The HTTP status indicates the failure type. For example, requesting a missing artist:

```http
GET /api/artists/999999
```

```http
HTTP/1.1 404 Not Found
Content-Type: application/json; charset=utf-8

{"error":"Artist not found."}
```

Invalid login credentials return `401 Unauthorized`:

```sh
curl -i -X POST http://localhost:5001/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"not-a-user@example.invalid","password":"invalid"}'
```

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json; charset=utf-8

{"error":"Invalid email or password."}
```

Other handled failures include `404` for missing records, `409` when registering an already-used email, and `500` with a resource-specific error when a database operation fails. Unknown paths use Express's default 404 response, which is not the API's JSON error format.

## Local setup

Prerequisites: Node.js with npm, and a reachable MySQL server. The database must contain the tables expected by the routes: `artists`, `songs`, `users`, `artist_profiles`, `bookings`, and `venue_profiles`.

From the repository root after cloning:

```sh
cd Team_4_Artist_Server
npm ci
cp .env.example .env
```

Edit `.env` and set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` to the MySQL database values. `PORT` defaults to `5001` in `.env.example`; `FRONTEND_ORIGIN` controls the single allowed CORS origin and defaults there to `http://localhost:5173`.

Then start the API:

```sh
npm start
```

In another terminal, verify the connection:

```sh
curl http://localhost:5001/api/health
```

The expected response with a working database is `{"api":"ok","database":"connected"}`. **This repository does not include database migrations, table-creation SQL, or seed data.** Obtain/import a compatible schema and create the configured database before expecting health to report `connected` or data routes to work. The server may still start without a reachable database, but data operations will return `500` and health will report `503`.

For local development with automatic restarts, run `npm run dev` instead of `npm start`.

## Deploy the server to Render

This repository includes a `render.yaml` Blueprint for the API server only. It builds with `npm ci`, starts with `npm start`, and uses `/api/health` as its health check. It does not deploy the frontend.

### Database prerequisite

The API requires MySQL. Render's managed database Blueprint resource is PostgreSQL, which is not compatible with this server's `mysql2` client. Create or choose an external hosted MySQL database, then make sure it contains the six tables listed under Local setup. This repository does not include schema migrations or seed data, so import a compatible schema before deploying if you need data routes to work.

Use the database provider's connection details to set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`. Confirm that the provider allows inbound MySQL connections from Render. Never commit these credentials or put them in `render.yaml`.

### Deploy steps

1. Push this server repository, including `render.yaml`, to a GitHub, GitLab, or Bitbucket repository connected to your Render account. Keep `.env` out of Git; it is ignored by `.gitignore`.
2. In the Render Dashboard, choose **New** then **Blueprint**, connect the server repository, and select `render.yaml`.
3. Enter the MySQL connection values when Render prompts for the `sync: false` environment variables. Set `FRONTEND_ORIGIN` to the exact origin that will call the API, such as `https://your-frontend.example`; this setting does not deploy that frontend.
4. Create the Blueprint and wait for the web service deploy. Render supplies `PORT` automatically; do not set it manually.
5. Test the deployed API, replacing the hostname with the service URL shown in Render:

  ```sh
  curl https://artist-api-server.onrender.com/api/health
  ```

  A working database connection returns `{"api":"ok","database":"connected"}`. A `503` response means the service cannot connect to MySQL; verify the host, port, credentials, network access, and schema setup.

The Blueprint uses Render's free web-service plan. Free services may spin down when idle, so the first request after inactivity can take longer. Select a paid plan in Render if you need continuously available production service.