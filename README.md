# Artist API Server

## Overview

The Artist API is a JSON REST API for an artist-booking platform. It lets the platform's frontend and other clients browse artists, songs, artist and venue profiles, and bookings, as well as create and manage users and those records. The API uses Express and MySQL.

## Authentication

The API currently has no token, session, or authorization middleware. All routes, including write and delete routes, are publicly reachable. No `Authorization` header is required. Requests with a body should set `Content-Type: application/json`.

To check credentials, send a JSON `POST` to `/api/users/login` with `email` and `password` fields. A successful login returns the user's `id`, `name`, `email`, and `role`; it does not issue a token, so it does not authenticate subsequent requests. The current implementation compares submitted passwords directly with database values. Do not use real passwords until password hashing and access control are implemented.

## Endpoint examples

The deployed API base URL is `https://artist-api-server.onrender.com`. All paths below use the `/api` prefix. Successful `GET` requests return JSON. Successful `POST` requests generally return `201 Created`; successful `PUT` requests return JSON with `200 OK`; successful `DELETE` requests return an empty `204 No Content` response.

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

### Most important endpoint command

List artists from the deployed API:

```sh
curl https://artist-api-server.onrender.com/api/artists
```

This exact command was run against the deployed API. It returned HTTP `200` and this JSON:

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
curl https://artist-api-server.onrender.com/api/songs
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
curl https://artist-api-server.onrender.com/api/profiles/artists
```

```json
[
  {"id":2,"userId":10,"stageName":"Moses","genre":"jazz","bio":"eijdjeij","location":"Kena","performanceFee":"200.00","profileImage":"iojeiw","instagram":"werwer","youtube":"ewfwe","spotify":"rewrew","socialLinks":{"instagram":"werwer","youtube":"ewfwe","spotify":"rewrew"}},
  {"id":1,"userId":1,"stageName":"John Artist","genre":"Afrobeats","bio":"Upcoming artist from Nairobi.","location":"Nairobi","performanceFee":"500.00","profileImage":"","instagram":"","youtube":"","spotify":"","socialLinks":{"instagram":"","youtube":"","spotify":""}}
]
```

List bookings:

```sh
curl https://artist-api-server.onrender.com/api/bookings
```

```json
[{"id":1,"artistId":1,"venueId":3,"eventDate":"2026-09-15T00:00:00.000Z","offeredFee":"1200.00","status":"Pending","notes":"Scheduled for a live showcase night.","createdAt":"2026-09-08T17:28:13.000Z"}]
```

List venue profiles:

```sh
curl https://artist-api-server.onrender.com/api/venues
```

```json
[{"id":1,"userId":3,"venueName":"Royal Arena","location":"Nairobi","capacity":1200,"supportedGenres":"Afrobeats,R&B,Pop","description":"Large venue for concerts and live performances.","createdAt":"2026-09-08T17:28:13.000Z","updatedAt":"2026-09-08T17:28:13.000Z"}]
```

Register a user with `POST /api/users` using JSON fields `name`, `email`, `password`, and `role`. A successful response has status `201` and returns `id`, `name`, `email`, and `role` (not the password). To create an artist, song, booking, or venue profile, send a JSON object with the fields used by that resource; the route table above shows the collection and item paths.

## Error format

Handled API errors use a JSON object with an `error` string. The HTTP status indicates the failure type. For example, requesting a missing artist:

```sh
curl -i https://artist-api-server.onrender.com/api/artists/999999
```

```http
HTTP/2 404
Content-Type: application/json; charset=utf-8

{"error":"Artist not found."}
```

Invalid login credentials return `401 Unauthorized`:

```sh
curl -i -X POST https://artist-api-server.onrender.com/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"not-a-user@example.invalid","password":"invalid"}'
```

```http
HTTP/2 401
Content-Type: application/json; charset=utf-8

{"error":"Invalid email or password."}
```

Other handled failures include `404` for missing records, `409` when registering an already-used email, and `500` with a resource-specific error when a database operation fails. Unknown paths use Express's default 404 response, which is not the API's JSON error format.

## Local setup

Prerequisites: Node.js with npm, and a reachable MySQL server. The database must contain the tables expected by the routes: `artists`, `songs`, `users`, `artist_profiles`, `bookings`, and `venue_profiles`. The `schema.sql` file creates these tables without inserting sample data.

From the cloned server repository root:

```sh
npm ci
cp .env.example .env
```

Edit `.env` and set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` to a reachable MySQL database. `PORT` defaults to `5001` in `.env.example`; `FRONTEND_ORIGIN` controls the single allowed CORS origin and defaults there to `http://localhost:5173`. These example commands create a local database and import the schema; change the host, user, or database name to match `.env` if needed:

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

The expected response with a working database is `{"api":"ok","database":"connected"}`. Import `schema.sql` into the configured database before expecting data routes to work. It creates the six tables but does not add any records. The server may still start without a reachable database, but data operations will return `500` and health will report `503`.

For local development with automatic restarts, run `npm run dev` instead of `npm start`.