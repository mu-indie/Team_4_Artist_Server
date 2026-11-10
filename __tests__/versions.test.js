const { afterEach, describe, expect, it } = require('@jest/globals');
const {
  API_KEY,
  apiRequest,
  database: { resetDatabase, seedArtist, seedBooking, seedVenueProfile },
} = require('./support/api');

describe('versioned API contract', () => {
  afterEach(resetDatabase);

  it('keeps the original v1 response shapes for the downstream collection endpoints', async () => {
    const artist = seedArtist({ id: 31, name: 'Mina', genre: 'Jazz', bio: 'A saxophonist.' });
    const venue = seedVenueProfile({ id: 4, userId: 20, venueName: 'Sample Venue' });
    const booking = seedBooking({ id: 8, artistId: 31, venueId: 20, eventDate: '2026-12-01', notes: 'A sample booking.' });

    const artistResponse = await apiRequest('GET', '/v1/api/artists');
    expect(artistResponse.status).toBe(200);
    expect(artistResponse.body).toEqual([{ id: 31, name: 'Mina', genre: 'Jazz', bio: 'A saxophonist.' }]);
    expect(artistResponse.headers.deprecation).toBe('true');
    expect(artistResponse.headers.link).toBe('</v2/api/artists>; rel="successor-version"');

    const venueResponse = await apiRequest('GET', '/v1/api/venues');
    expect(venueResponse.status).toBe(200);
    expect(venueResponse.body).toEqual([
      { id: 4, userId: 20, venueName: 'Sample Venue', location: 'Nairobi', capacity: 100, supportedGenres: 'Jazz', description: 'A sample venue.', createdAt: expect.any(String), updatedAt: expect.any(String) },
    ]);
    expect(venueResponse.headers.link).toBe('</v2/api/venues>; rel="successor-version"');

    const bookingResponse = await apiRequest('GET', '/v1/api/bookings', { user: { id: 31, role: 'artist' } });
    expect(bookingResponse.status).toBe(200);
    expect(bookingResponse.body).toEqual([
      {
        id: 8,
        artistId: 31,
        venueId: 20,
        eventDate: '2026-12-01',
        createdByUserId: 10,
        offeredFee: '650.00',
        status: 'Pending',
        notes: 'A sample booking.',
        createdAt: expect.any(String),
      },
    ]);
    expect(bookingResponse.headers.link).toBe('</v2/api/bookings>; rel="successor-version"');
    expect({ artist, venue, booking }).toBeTruthy();
  });

  it('keeps the original unversioned routes aligned with v1 and with deprecation headers', async () => {
    seedArtist({ id: 12, name: 'Amina', genre: 'Soul', bio: 'A singer.' });
    seedVenueProfile({ id: 5, userId: 21, venueName: 'The Lantern' });
    seedBooking({ id: 9, artistId: 12, venueId: 21, eventDate: '2026-12-05', notes: 'Legacy booking.' });

    const v1Artist = await apiRequest('GET', '/v1/api/artists');
    const legacyArtist = await apiRequest('GET', '/api/artists');
    expect(legacyArtist.status).toBe(200);
    expect(legacyArtist.body).toEqual(v1Artist.body);
    expect(legacyArtist.headers.link).toBe('</v2/api/artists>; rel="successor-version"');

    const v1Venue = await apiRequest('GET', '/v1/api/venues');
    const legacyVenue = await apiRequest('GET', '/api/venues');
    expect(legacyVenue.status).toBe(200);
    expect(legacyVenue.body).toEqual(v1Venue.body);
    expect(legacyVenue.headers.link).toBe('</v2/api/venues>; rel="successor-version"');

    const v1Booking = await apiRequest('GET', '/v1/api/bookings', { user: { id: 12, role: 'artist' } });
    const legacyBooking = await apiRequest('GET', '/api/bookings', { user: { id: 12, role: 'artist' } });
    expect(legacyBooking.status).toBe(200);
    expect(legacyBooking.body).toEqual(v1Booking.body);
    expect(legacyBooking.headers.link).toBe('</v2/api/bookings>; rel="successor-version"');
  });

  it('keeps the v1 error payloads unchanged and still requires the API key', async () => {
    const missingKey = await apiRequest('GET', '/v1/api/venues', { key: null });
    expect(missingKey.status).toBe(401);
    expect(missingKey.body).toEqual({ message: 'Missing or invalid API key' });

    const badId = await apiRequest('GET', '/v1/api/venues/999999');
    expect(badId.status).toBe(404);
    expect(badId.body).toEqual({ error: 'Venue profile not found.' });
    expect(badId.headers.link).toBe('</v2/api/venues/999999>; rel="successor-version"');
  });

  it('wraps eligible v2 collection responses in a data/count envelope without changing the underlying record fields', async () => {
    seedArtist({ id: 41, name: 'Eve', genre: 'Pop', bio: 'A vocalist.' });
    seedVenueProfile({ id: 9, userId: 30, venueName: 'The Hall' });
    seedBooking({ id: 21, artistId: 41, venueId: 30, eventDate: '2026-11-12', notes: 'v2 booking.' });

    const artistResponse = await apiRequest('GET', '/v2/api/artists');
    expect(artistResponse.status).toBe(200);
    expect(artistResponse.body).toEqual({
      data: [{ id: 41, name: 'Eve', genre: 'Pop', bio: 'A vocalist.' }],
      count: 1,
    });

    const venueResponse = await apiRequest('GET', '/v2/api/venues');
    expect(venueResponse.status).toBe(200);
    expect(venueResponse.body).toEqual({
      data: [
        {
          id: 9,
          userId: 30,
          venueName: 'The Hall',
          location: 'Nairobi',
          capacity: 100,
          supportedGenres: 'Jazz',
          description: 'A sample venue.',
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
      ],
      count: 1,
    });

    const bookingResponse = await apiRequest('GET', '/v2/api/bookings', { user: { id: 41, role: 'artist' } });
    expect(bookingResponse.status).toBe(200);
    expect(bookingResponse.body).toMatchObject({
      data: [
        {
          id: 21,
          artistId: 41,
          venueId: 30,
          eventDate: '2026-11-12',
          notes: 'v2 booking.',
        },
      ],
      count: 1,
    });
    expect(bookingResponse.headers.deprecation).toBeUndefined();
  });

  it('requires the API key for v2 requests too', async () => {
    const noKey = await apiRequest('GET', '/v2/api/venues', { key: null });
    expect(noKey.status).toBe(401);
    expect(noKey.body).toEqual({ message: 'Missing or invalid API key' });

    const valid = await apiRequest('GET', '/v2/api/venues');
    expect(valid.status).toBe(200);
    expect(valid.body.count).toBeGreaterThanOrEqual(0);
    expect(valid.headers.link).toBeUndefined();
  });

  it('does not deprecate unrelated unversioned endpoints', async () => {
    const response = await apiRequest('GET', '/');

    expect(response.status).toBe(200);
    expect(response.headers.deprecation).toBeUndefined();
    expect(response.headers.sunset).toBeUndefined();
    expect(response.headers.link).toBeUndefined();
  });
});
