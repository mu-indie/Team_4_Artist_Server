# API Endpoint List

Base URL for local development: `http://localhost:5001`

Unless noted otherwise, requests require an `X-API-Key`. Protected user and
resource operations also require `Authorization: Bearer <user access token>`.
Requests with a JSON body should use `Content-Type: application/json`.

## Status and integrations

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/` | API key | API status |
| GET | `/api/health` | Public | API and database health |
| GET | `/upcoming` | API key | Active tasks from the partner integration |
| GET | `/api/upcoming` | API key | Alias for `/upcoming` |
| GET | `/api/artisans` | API key | Artisans from the configured integration, enriched with phone details |

## Artists

Artist reads require an API key. Artist writes require an artist token but are
currently disabled and return `403`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/artists` | List artists |
| GET | `/api/artists/:id` | Get an artist |
| POST | `/api/artists` | Create artist (disabled) |
| PUT | `/api/artists/:id` | Update artist (disabled) |
| DELETE | `/api/artists/:id` | Delete artist (disabled) |
| GET | `/artists` | Alias for `GET /api/artists` |
| GET | `/artists/:id` | Alias for `GET /api/artists/:id` |
| POST | `/artists` | Alias for disabled artist creation |
| PUT | `/artists/:id` | Alias for disabled artist update |
| DELETE | `/artists/:id` | Alias for disabled artist deletion |

## Songs

Song reads require an API key. Writes require an artist token and are restricted
to songs owned by that artist.

| Method | Path | Description |
|---|---|---|
| GET | `/api/songs` | List songs |
| GET | `/api/songs/:id` | Get a song |
| POST | `/api/songs` | Create a song |
| PUT | `/api/songs/:id` | Replace a song |
| DELETE | `/api/songs/:id` | Delete a song |

## Users

Registration and login require an API key, but no user token. Account operations
require the account owner's token. `/users` paths are aliases for `/api/users`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/users` | Get the authenticated user's account as a one-item array |
| POST | `/api/users` | Register a user |
| POST | `/api/users/login` | Authenticate and issue a user access token |
| GET | `/api/users/:id` | Get the authenticated user's account |
| PUT | `/api/users/:id` | Update the authenticated user's account |
| DELETE | `/api/users/:id` | Delete the authenticated user's account |
| GET | `/users` | Alias for `GET /api/users` |
| POST | `/users` | Alias for `POST /api/users` |
| POST | `/users/login` | Alias for `POST /api/users/login` |
| GET | `/users/:id` | Alias for `GET /api/users/:id` |
| PUT | `/users/:id` | Alias for `PUT /api/users/:id` |
| DELETE | `/users/:id` | Alias for `DELETE /api/users/:id` |

## Artist profiles

Profile listing and lookup require an API key. Saving and deleting a profile
require the matching artist's user token.

| Method | Path | Description |
|---|---|---|
| GET | `/api/profiles/artists` | List artist profiles |
| GET | `/api/profiles/artists/:userId` | Get an artist profile by user ID |
| PUT | `/api/profiles/artists/:userId` | Save or update an artist profile |
| DELETE | `/api/profiles/artists/:userId` | Delete an artist profile |

## Bookings

All booking endpoints require a user token. Creation, update, and deletion are
restricted to an artist or venue participating in the booking.

| Method | Path | Description |
|---|---|---|
| GET | `/api/bookings` | List the authenticated user's bookings |
| GET | `/api/bookings/:id` | Get a booking involving the authenticated user |
| POST | `/api/bookings` | Create a booking (starts as `Pending`) |
| PUT | `/api/bookings/:id` | Update a booking or its allowed status transition |
| DELETE | `/api/bookings/:id` | Delete a booking |

## Venue profiles

Listing and lookup require an API key. Create, update, and delete require a
venue user's token; write operations apply to that user's profiles.

| Method | Path | Description |
|---|---|---|
| GET | `/api/venues` | List venue profiles |
| GET | `/api/venues/:id` | Get a venue profile |
| POST | `/api/venues` | Create a venue profile |
| PUT | `/api/venues/:id` | Update a venue profile |
| DELETE | `/api/venues/:id` | Delete a venue profile |

## Methods not implemented

No `PATCH` endpoints are currently implemented. Unknown paths or unsupported
methods return a `404` response.
