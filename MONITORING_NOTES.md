# Monitoring Notes

## Predictions

- **Expected slowest endpoint: `GET /api/artisans`.** It fetches the artisan list, then makes a detail request for each artisan to add phone numbers.
- **Expected to produce the most errors: `GET /upcoming` and `GET /api/upcoming`.** These routes depend on the partner service and return `503` when it is unconfigured or `502` when the partner request fails.

## Results

The local traffic script exercised the app on port `5100`. It did not call `/api/artisans` or `/upcoming` because those routes forward configured API credentials to external partner services; their predictions remain untested.

- For `N=60`, the script returned `200: 30`, `401: 5`, and `404: 25`. The captured `/stats` snapshot is in [monitoring-stats-60.json](./monitoring-stats-60.json); at that point it reported `total: 65`, `clientErrors: 33`, `serverErrors: 0`, `errorRatePercent: 0`, and `avgMs: 6.5`.
- For `N=200`, the script returned `200: 24`, `401: 24`, `404: 19`, and `429: 133`. The captured `/stats` snapshot is in [monitoring-stats-200.json](./monitoring-stats-200.json); it reported `total: 266`, `clientErrors: 209`, `serverErrors: 0`, `errorRatePercent: 0`, and `avgMs: 2.2`.
- The slowest observed route by average was `GET /api/artists/:id` at `24.2 ms` over `14` requests; its `maxMs` was `312.5`. `GET /api/songs/:id` averaged `4.7 ms` over `12` requests. The `/api/artisans` prediction cannot be compared because it was not exercised.
- The largest error group was `GET (no route)` with `183` client errors in the `N=200` snapshot. These include the intentional no-key, unknown-path, and rate-limit test requests. The two ID lookups returned client errors as well: `14` for artists and `12` for songs. There were no server errors in the captured run.

All `32` logged `401` responses had `caller: "none"`. The test deliberately sent missing and incorrect credentials, so these results are expected; the caller field alone cannot distinguish a typo from probing because failed keys are not fingerprinted.

## Pattern and next check

The deliberate `N=200` run produced `133` rate-limit responses while `/stats` still reported `0` server errors. The artist-ID lookup also had a `312.5 ms` maximum despite its `24.2 ms` average. One hypothesis is variable database response time on these lookups; next, compare repeated lookups for an existing artist and a missing ID while checking database query timing.

## Production alert

Alert when `serverErrors` increases above the observed `0` baseline between `/stats` polls, and investigate the route and its dependency. The current `/upcoming` implementation has no cached-data fallback: it returns `503` when the partner integration is unconfigured and `502` when the partner request fails, so users receive an error while the dependency is unavailable.
