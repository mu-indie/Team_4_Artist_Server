const { afterEach, describe, expect, it } = require('@jest/globals');
const {
  apiRequest,
  database: { resetDatabase, seedArtistProfile, state },
} = require('./support/api');

const artist = { id: 17, role: 'artist' };

function profile(overrides = {}) {
  return {
    stageName: 'Amina',
    genre: 'Jazz',
    bio: 'A vocalist based in Nairobi.',
    location: 'Nairobi',
    performanceFee: 500,
    socialLinks: { instagram: '@amina', youtube: 'https://example.test/amina' },
    ...overrides,
  };
}

describe('artist profiles API', () => {
  afterEach(resetDatabase);

  it('lists profiles with socialLinks and their expected property types', async () => {
    seedArtistProfile({ id: 5, userId: 17, instagram: '@amina', youtube: null, spotify: null });

    const response = await apiRequest('GET', '/api/profiles/artists');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      id: 5,
      userId: 17,
      stageName: 'Sample Artist',
      genre: 'Jazz',
      location: 'Nairobi',
      performanceFee: '500.00',
      socialLinks: { instagram: '@amina', youtube: '', spotify: '' },
    });
    expect(typeof response.body[0].socialLinks).toBe('object');
  });

  it('returns an empty collection when no artist profiles exist', async () => {
    const response = await apiRequest('GET', '/api/profiles/artists');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('looks up an artist profile by user ID and returns a resource error when absent', async () => {
    seedArtistProfile({ id: 5, userId: 17, instagram: '@amina' });

    const found = await apiRequest('GET', '/api/profiles/artists/17');
    expect(found.status).toBe(200);
    expect(found.body).toMatchObject({
      id: 5,
      userId: 17,
      socialLinks: { instagram: '@amina', youtube: '', spotify: '' },
    });

    const missing = await apiRequest('GET', '/api/profiles/artists/not-an-id');
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: 'Profile not found.' });
  });

  it('saves an artist profile and its optional social links', async () => {
    const response = await apiRequest('PUT', '/api/profiles/artists/17', {
      user: artist,
      body: profile(),
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Artist profile saved successfully.' });
    expect(state.artistProfiles).toHaveLength(1);
    expect(state.artistProfiles[0]).toMatchObject({
      userId: 17,
      stageName: 'Amina',
      genre: 'Jazz',
      bio: 'A vocalist based in Nairobi.',
      location: 'Nairobi',
      performanceFee: '500.00',
      instagram: '@amina',
      youtube: 'https://example.test/amina',
      spotify: null,
    });
  });

  it('accepts the maximum fee and four unique supported counties as boundary values', async () => {
    const response = await apiRequest('PUT', '/api/profiles/artists/17', {
      user: artist,
      body: profile({
        location: 'Nairobi, Mombasa, Taita–Taveta, Nakuru',
        performanceFee: 99999999.99,
      }),
    });

    expect(response.status).toBe(200);
    expect(state.artistProfiles[0].location).toBe('Nairobi, Mombasa, Taita–Taveta, Nakuru');
    expect(state.artistProfiles[0].performanceFee).toBe('99999999.99');
  });

  it.each([
    [{ ...profile(), genre: undefined }, 'genre is required.'],
    [{ ...profile(), stageName: '' }, 'stageName is required.'],
    [{ ...profile(), performanceFee: 0 }, 'performanceFee must be greater than 0 and no more than 99999999.99.'],
    [{ ...profile(), performanceFee: '500' }, 'performanceFee must be greater than 0 and no more than 99999999.99.'],
    [{ ...profile(), location: 'London' }, 'location must contain up to 4 unique supported Kenyan counties separated by commas.'],
    [{ ...profile(), socialLinks: [] }, 'Social links must be an object.'],
    [{ ...profile(), socialLinks: { spotify: 4 } }, 'spotify must be a string.'],
  ])('rejects invalid artist profile fields without database writes', async (body, error) => {
    const response = await apiRequest('PUT', '/api/profiles/artists/17', { user: artist, body });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error });
    expect(state.artistProfiles).toHaveLength(0);
    expect(state.queries).toHaveLength(0);
  });

  it('rejects requests from a different owner before saving or deleting a profile', async () => {
    const foreignUpdate = await apiRequest('PUT', '/api/profiles/artists/18', {
      user: artist,
      body: profile(),
    });
    expect(foreignUpdate.status).toBe(404);
    expect(foreignUpdate.body).toEqual({ error: 'Not found.' });

    const foreignDelete = await apiRequest('DELETE', '/api/profiles/artists/18', { user: artist });
    expect(foreignDelete.status).toBe(404);
    expect(foreignDelete.body).toEqual({ error: 'Not found.' });
    expect(state.queries).toHaveLength(0);
  });

  it('deletes an owned profile and reports a repeated delete as not found', async () => {
    seedArtistProfile({ id: 5, userId: 17 });

    const deleted = await apiRequest('DELETE', '/api/profiles/artists/17', { user: artist });
    expect(deleted.status).toBe(204);
    expect(deleted.text).toBe('');
    expect(state.artistProfiles).toHaveLength(0);

    const repeated = await apiRequest('DELETE', '/api/profiles/artists/17', { user: artist });
    expect(repeated.status).toBe(404);
    expect(repeated.body).toEqual({ error: 'Profile not found.' });
  });
});
