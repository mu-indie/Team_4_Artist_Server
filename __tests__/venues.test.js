const { afterEach, describe, expect, it } = require('@jest/globals');
const {
  apiRequest,
  database: { resetDatabase, seedVenueProfile, state },
} = require('./support/api');

const venueUser = { id: 20, role: 'venue' };

function venueProfile(overrides = {}) {
  return {
    venueName: 'The Blue Note',
    location: 'Nairobi',
    capacity: 250,
    supportedGenres: 'Jazz, R&B',
    description: 'An intimate music venue.',
    ...overrides,
  };
}

describe('venue profiles API', () => {
  afterEach(resetDatabase);

  it('lists venue profiles with documented fields and types', async () => {
    seedVenueProfile({ id: 4, userId: 20 });

    const response = await apiRequest('GET', '/api/venues');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      id: 4,
      userId: 20,
      venueName: 'Sample Venue',
      location: 'Nairobi',
      capacity: 100,
      supportedGenres: 'Jazz',
      description: 'A sample venue.',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(typeof response.body[0].capacity).toBe('number');
  });

  it('returns an empty collection when no venue profiles exist', async () => {
    const response = await apiRequest('GET', '/api/venues');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('returns a venue profile by ID and reports missing or malformed IDs', async () => {
    seedVenueProfile({ id: 4 });

    const found = await apiRequest('GET', '/api/venues/4');
    expect(found.status).toBe(200);
    expect(found.body).toMatchObject({ id: 4, venueName: 'Sample Venue', capacity: 100 });

    for (const id of ['9999', 'bad-id']) {
      const missing = await apiRequest('GET', `/api/venues/${id}`);
      expect(missing.status).toBe(404);
      expect(missing.body).toEqual({ error: 'Venue profile not found.' });
    }
  });

  it('creates a profile owned by the authenticated venue and ignores a supplied owner ID', async () => {
    const response = await apiRequest('POST', '/api/venues', {
      user: venueUser,
      body: venueProfile({ userId: 9999 }),
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: expect.any(Number),
      userId: 20,
      venueName: 'The Blue Note',
      location: 'Nairobi',
      capacity: 250,
      supportedGenres: 'Jazz, R&B',
      description: 'An intimate music venue.',
    });
    expect(state.venueProfiles).toHaveLength(1);
    expect(state.venueProfiles[0].userId).toBe(20);
  });

  it('accepts zero capacity and normalizes omitted optional fields at the boundary', async () => {
    const response = await apiRequest('POST', '/api/venues', {
      user: venueUser,
      body: venueProfile({ capacity: 0, supportedGenres: null, description: null }),
    });

    expect(response.status).toBe(201);
    expect(response.body.capacity).toBe(0);
    expect(response.body.supportedGenres).toBe('');
    expect(response.body.description).toBe('');
  });

  it.each([
    [{ venueName: 'The Blue Note', location: 'Nairobi' }, 'capacity must be a non-negative integer.'],
    [{ ...venueProfile(), venueName: ' ' }, 'venueName is required.'],
    [{ ...venueProfile(), location: 'London' }, 'location must be one of the supported Kenyan counties.'],
    [{ ...venueProfile(), capacity: -1 }, 'capacity must be a non-negative integer.'],
    [{ ...venueProfile(), capacity: 1.5 }, 'capacity must be a non-negative integer.'],
    [{ ...venueProfile(), supportedGenres: [] }, 'supportedGenres must be a string.'],
  ])('rejects invalid venue creation values before database writes', async (body, error) => {
    const response = await apiRequest('POST', '/api/venues', { user: venueUser, body });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error });
    expect(state.venueProfiles).toHaveLength(0);
    expect(state.queries).toHaveLength(0);
  });

  it('rejects profile writes by non-venue users', async () => {
    const response = await apiRequest('POST', '/api/venues', {
      user: { id: 10, role: 'artist' },
      body: venueProfile(),
    });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Forbidden.' });
    expect(state.venueProfiles).toHaveLength(0);
  });

  it('updates and persists an owned venue profile', async () => {
    seedVenueProfile({ id: 4, userId: 20 });

    const response = await apiRequest('PUT', '/api/venues/4', {
      user: venueUser,
      body: venueProfile({ venueName: 'The Green Room', capacity: 0 }),
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: 4, venueName: 'The Green Room', capacity: 0 });
    expect(state.venueProfiles[0]).toMatchObject({ venueName: 'The Green Room', capacity: 0 });
  });

  it('rejects invalid venue updates and reports missing or foreign-owned profiles', async () => {
    seedVenueProfile({ id: 4, userId: 21 });

    const invalid = await apiRequest('PUT', '/api/venues/4', {
      user: venueUser,
      body: venueProfile({ capacity: 'many' }),
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toEqual({ error: 'capacity must be a non-negative integer.' });

    for (const id of ['9999', '4']) {
      const missing = await apiRequest('PUT', `/api/venues/${id}`, {
        user: venueUser,
        body: venueProfile(),
      });
      expect(missing.status).toBe(404);
      expect(missing.body).toEqual({ error: 'Venue profile not found.' });
    }
    expect(state.venueProfiles[0].venueName).toBe('Sample Venue');
  });

  it('deletes an owned profile and returns not found for a repeated delete', async () => {
    seedVenueProfile({ id: 4, userId: 20 });

    const deleted = await apiRequest('DELETE', '/api/venues/4', { user: venueUser });
    expect(deleted.status).toBe(204);
    expect(deleted.text).toBe('');
    expect(state.venueProfiles).toHaveLength(0);

    const repeated = await apiRequest('DELETE', '/api/venues/4', { user: venueUser });
    expect(repeated.status).toBe(404);
    expect(repeated.body).toEqual({ error: 'Venue profile not found.' });
  });
});
