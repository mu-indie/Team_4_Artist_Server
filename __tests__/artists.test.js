const { afterEach, describe, expect, it } = require('@jest/globals');
const {
  apiRequest,
  database: { resetDatabase, seedArtist, state },
} = require('./support/api');

describe('artists API', () => {
  afterEach(resetDatabase);

  it('returns artist collections from both route prefixes with the documented fields', async () => {
    const artist = seedArtist({ id: 31, name: 'Mina', genre: 'Jazz', bio: 'A saxophonist.' });

    for (const path of ['/api/artists', '/artists']) {
      const response = await apiRequest('GET', path);
      expect(response.status).toBe(200);
      expect(response.body).toEqual([{ id: 31, name: 'Mina', genre: 'Jazz', bio: 'A saxophonist.' }]);
      expect(typeof response.body[0].id).toBe('number');
      expect(typeof response.body[0].name).toBe('string');
    }
    expect(state.artists).toContain(artist);
  });

  it('returns an empty collection when no artists exist', async () => {
    const response = await apiRequest('GET', '/api/artists');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('returns artist details and a not-found response through both route prefixes', async () => {
    seedArtist({ id: 31, name: 'Mina' });

    for (const path of ['/api/artists/31', '/artists/31']) {
      const response = await apiRequest('GET', path);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: 31, name: 'Mina', genre: 'Jazz', bio: 'A sample artist.' });
    }
    for (const path of ['/api/artists/not-an-id', '/artists/9999']) {
      const response = await apiRequest('GET', path);
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Artist not found.' });
    }
  });

  it.each([
    ['POST', '/api/artists', { name: 'Artist' }],
    ['POST', '/artists', { name: 'Artist' }],
    ['PUT', '/api/artists/31', { name: 'Updated Artist' }],
    ['PUT', '/artists/31', { name: 'Updated Artist' }],
    ['DELETE', '/api/artists/31', undefined],
    ['DELETE', '/artists/31', undefined],
  ])('%s %s remains disabled after authentication', async (method, path, body) => {
    const response = await apiRequest(method, path, {
      user: { id: 31, role: 'artist' },
      body,
    });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Artist writes are disabled until ownership migration and authorization are verified.',
    });
    expect(state.queries).toHaveLength(0);
  });

  it('requires an artist token for disabled write routes', async () => {
    const response = await apiRequest('POST', '/artists', { body: { name: 'Artist' } });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: 'Missing or invalid user access token' });
  });
});
