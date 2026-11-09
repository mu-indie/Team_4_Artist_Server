const { afterEach, describe, expect, it } = require('@jest/globals');
const {
  apiRequest,
  database: { resetDatabase, seedBooking, state },
} = require('./support/api');

const artist = { id: 10, role: 'artist' };
const venue = { id: 20, role: 'venue' };

function booking(overrides = {}) {
  return {
    artistId: 10,
    venueId: 20,
    eventDate: '2026-12-10',
    offeredFee: 650,
    notes: 'One-hour set.',
    ...overrides,
  };
}

describe('bookings API', () => {
  afterEach(resetDatabase);

  it('lists only bookings involving the authenticated user and supports empty results', async () => {
    seedBooking({ id: 1, artistId: 10, venueId: 20 });
    seedBooking({ id: 2, artistId: 11, venueId: 20 });
    seedBooking({ id: 3, artistId: 11, venueId: 21 });

    const response = await apiRequest('GET', '/api/bookings', { user: artist });

    expect(response.status).toBe(200);
    expect(response.body.map(({ id }) => id)).toEqual([1]);
    expect(response.body[0]).toMatchObject({
      id: 1,
      artistId: 10,
      venueId: 20,
      eventDate: '2026-12-01',
      offeredFee: '650.00',
      status: 'Pending',
      notes: 'A sample booking.',
      createdAt: expect.any(String),
    });

    resetDatabase();
    const empty = await apiRequest('GET', '/api/bookings', { user: artist });
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual([]);
  });

  it('returns a booking only to a participant, with missing IDs reported as not found', async () => {
    seedBooking({ id: 4, artistId: 10, venueId: 20 });

    const found = await apiRequest('GET', '/api/bookings/4', { user: venue });
    expect(found.status).toBe(200);
    expect(found.body).toMatchObject({ id: 4, artistId: 10, venueId: 20 });

    for (const [id, user] of [['9999', artist], ['4', { id: 30, role: 'artist' }], ['bad-id', artist]]) {
      const missing = await apiRequest('GET', `/api/bookings/${id}`, { user });
      expect(missing.status).toBe(404);
      expect(missing.body).toEqual({ error: 'Booking not found.' });
    }
  });

  it('creates a pending booking and persists the requested data', async () => {
    const response = await apiRequest('POST', '/api/bookings', { user: venue, body: booking() });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: expect.any(Number),
      artistId: 10,
      venueId: 20,
      createdByUserId: 20,
      eventDate: '2026-12-10',
      offeredFee: '650.00',
      status: 'Pending',
      notes: 'One-hour set.',
      createdAt: expect.any(String),
    });
    expect(state.bookings).toHaveLength(1);
    expect(state.bookings[0]).toMatchObject({
      artistId: 10,
      venueId: 20,
      createdByUserId: 20,
      status: 'Pending',
    });
  });

  it.each([
    [{ ...booking(), venueId: undefined }, 'venueId is required.'],
    [{ ...booking(), eventDate: '2026-02-30' }, 'eventDate must be a valid date in YYYY-MM-DD format.'],
    [{ ...booking(), offeredFee: '650' }, 'offeredFee must be a number.'],
    [{ ...booking(), notes: 17 }, 'notes must be a string.'],
    [{ ...booking(), status: 'Completed' }, 'New bookings must start with Pending status.'],
  ])('rejects invalid booking creation values without writing', async (body, error) => {
    const response = await apiRequest('POST', '/api/bookings', { user: artist, body });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error });
    expect(state.bookings).toHaveLength(0);
    expect(state.queries).toHaveLength(0);
  });

  it('requires the authenticated participant ID and a booking-capable role', async () => {
    const foreign = await apiRequest('POST', '/api/bookings', {
      user: artist,
      body: booking({ artistId: 11 }),
    });
    expect(foreign.status).toBe(403);
    expect(foreign.body).toEqual({ error: 'You can only modify bookings you own.' });

    const noToken = await apiRequest('POST', '/api/bookings', { body: booking() });
    expect(noToken.status).toBe(401);
    expect(noToken.body).toEqual({ message: 'Missing or invalid user access token' });
    expect(state.bookings).toHaveLength(0);
  });

  it('updates a pending booking when its invited participant confirms it', async () => {
    seedBooking({ id: 4, artistId: 10, venueId: 20, createdByUserId: 20 });

    const response = await apiRequest('PUT', '/api/bookings/4', {
      user: artist,
      body: { artistId: 10, status: 'Confirmed', notes: 'Confirmed by artist.' },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 4,
      status: 'Confirmed',
      notes: 'Confirmed by artist.',
    });
    expect(state.bookings[0]).toMatchObject({ status: 'Confirmed', notes: 'Confirmed by artist.' });
  });

  it.each([
    [{ artistId: 10, eventDate: 'next Friday' }, 'eventDate must be a valid date in YYYY-MM-DD format.'],
    [{ artistId: 10, offeredFee: 'free' }, 'offeredFee must be a number.'],
    [{ artistId: 10, notes: [] }, 'notes must be a string.'],
    [{ artistId: 10, status: 'Unknown' }, 'Invalid booking status.'],
  ])('rejects invalid booking updates and preserves the original state', async (body, error) => {
    const original = seedBooking({ id: 4, artistId: 10, venueId: 20 });

    const response = await apiRequest('PUT', '/api/bookings/4', { user: artist, body });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error });
    expect(state.bookings[0]).toEqual(original);
  });

  it('rejects forbidden transitions, participant changes, and updates to missing bookings', async () => {
    seedBooking({ id: 4, artistId: 10, venueId: 20, createdByUserId: 10 });

    const initiatorCannotConfirm = await apiRequest('PUT', '/api/bookings/4', {
      user: artist,
      body: { artistId: 10, status: 'Confirmed' },
    });
    expect(initiatorCannotConfirm.status).toBe(403);
    expect(initiatorCannotConfirm.body).toEqual({
      error: 'Only the invited participant can confirm or decline a booking.',
    });

    const changedParticipant = await apiRequest('PUT', '/api/bookings/4', {
      user: artist,
      body: { artistId: 10, venueId: 21 },
    });
    expect(changedParticipant.status).toBe(403);
    expect(changedParticipant.body).toEqual({ error: 'Booking participants cannot be changed.' });

    const missing = await apiRequest('PUT', '/api/bookings/9999', {
      user: artist,
      body: { artistId: 10 },
    });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: 'Booking not found.' });

    const terminal = await apiRequest('PUT', '/api/bookings/4', {
      user: venue,
      body: { venueId: 20, status: 'Cancelled' },
    });
    expect(terminal.status).toBe(200);
    const reopen = await apiRequest('PUT', '/api/bookings/4', {
      user: artist,
      body: { artistId: 10, status: 'Confirmed' },
    });
    expect(reopen.status).toBe(409);
    expect(reopen.body).toEqual({ error: 'A terminal booking status cannot be reopened.' });
  });

  it('deletes only an owned booking and returns not found when repeated', async () => {
    seedBooking({ id: 4, artistId: 10, venueId: 20 });

    const deleted = await apiRequest('DELETE', '/api/bookings/4', { user: venue });
    expect(deleted.status).toBe(204);
    expect(deleted.text).toBe('');
    expect(state.bookings).toHaveLength(0);

    const repeated = await apiRequest('DELETE', '/api/bookings/4', { user: venue });
    expect(repeated.status).toBe(404);
    expect(repeated.body).toEqual({ error: 'Booking not found.' });
  });
});
