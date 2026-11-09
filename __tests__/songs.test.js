const { afterEach, describe, expect, it } = require('@jest/globals');
const {
  apiRequest,
  database: { resetDatabase, seedSong, state },
} = require('./support/api');

const artist = { id: 10, role: 'artist' };

function validSong(overrides = {}) {
  return {
    artistId: 10,
    title: 'Blue Night',
    genre: 'Jazz',
    description: 'A live recording.',
    audioUrl: 'https://example.test/blue-night.mp3',
    coverImage: 'https://example.test/blue-night.jpg',
    uploadDate: '2026-11-08',
    ...overrides,
  };
}

describe('songs API', () => {
  afterEach(resetDatabase);

  it('lists songs with all documented properties and correct value types', async () => {
    seedSong({ id: 7, artistId: 10, title: 'Blue Night' });

    const response = await apiRequest('GET', '/api/songs');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      id: 7,
      artistId: 10,
      title: 'Blue Night',
      genre: 'Jazz',
      description: 'A sample track.',
      audioUrl: 'https://example.test/audio.mp3',
      coverImage: 'https://example.test/cover.jpg',
      uploadDate: '2026-01-01',
      createdAt: expect.any(String),
    });
    for (const field of ['id', 'artistId']) expect(typeof response.body[0][field]).toBe('number');
  });

  it('returns an empty collection when no songs exist', async () => {
    const response = await apiRequest('GET', '/api/songs');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('returns a song by ID and reports missing or malformed IDs', async () => {
    seedSong({ id: 7 });

    const found = await apiRequest('GET', '/api/songs/7');
    expect(found.status).toBe(200);
    expect(found.body).toMatchObject({ id: 7, artistId: 10, title: 'Sample Song' });

    for (const id of ['9999', 'not-an-id']) {
      const missing = await apiRequest('GET', `/api/songs/${id}`);
      expect(missing.status).toBe(404);
      expect(missing.body).toEqual({ error: 'Song not found.' });
    }
  });

  it('creates a song, returns its representation, and persists the requested values', async () => {
    const response = await apiRequest('POST', '/api/songs', { user: artist, body: validSong() });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: expect.any(Number),
      artistId: 10,
      title: 'Blue Night',
      genre: 'Jazz',
      description: 'A live recording.',
      audioUrl: 'https://example.test/blue-night.mp3',
      coverImage: 'https://example.test/blue-night.jpg',
      uploadDate: '2026-11-08',
      createdAt: expect.any(String),
    });
    expect(state.songs).toHaveLength(1);
    expect(state.songs[0]).toMatchObject(validSong());
  });

  it.each([
    [{ ...validSong(), title: undefined }, 'title is required.'],
    [{ ...validSong(), title: 9 }, 'title is required.'],
    [{ ...validSong(), uploadDate: '2026-02-30' }, 'uploadDate must be a valid date in YYYY-MM-DD format.'],
  ])('rejects invalid song creation data before a database write', async (body, error) => {
    const response = await apiRequest('POST', '/api/songs', { user: artist, body });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error });
    expect(state.songs).toHaveLength(0);
    expect(state.queries).toHaveLength(0);
  });

  it('rejects creation for an artist ID other than the authenticated user', async () => {
    const response = await apiRequest('POST', '/api/songs', {
      user: artist,
      body: validSong({ artistId: 11 }),
    });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'You can only modify records you own.' });
    expect(state.songs).toHaveLength(0);
  });

  it('replaces a song and persists all supplied fields', async () => {
    seedSong({ id: 7, artistId: 10 });
    const updated = validSong({ title: 'Updated Title' });
    delete updated.artistId;

    const response = await apiRequest('PUT', '/api/songs/7', { user: artist, body: updated });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 7,
      artistId: 10,
      title: 'Updated Title',
      uploadDate: '2026-11-08',
    });
    expect(state.songs[0]).toMatchObject({
      title: 'Updated Title',
      genre: 'Jazz',
      description: 'A live recording.',
      audioUrl: 'https://example.test/blue-night.mp3',
      coverImage: 'https://example.test/blue-night.jpg',
      uploadDate: '2026-11-08',
    });
  });

  it('rejects incomplete or malformed song updates without changing the resource', async () => {
    const original = seedSong({ id: 7, artistId: 10 });

    for (const body of [
      { title: 'Incomplete' },
      validSong({ uploadDate: 'tomorrow' }),
    ]) {
      const response = await apiRequest('PUT', '/api/songs/7', { user: artist, body });
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    }

    expect(state.songs[0]).toEqual(original);
  });

  it('returns not found for missing and non-owned song updates', async () => {
    seedSong({ id: 7, artistId: 11 });

    for (const id of ['9999', '7']) {
      const response = await apiRequest('PUT', `/api/songs/${id}`, {
        user: artist,
        body: validSong(),
      });
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Song not found.' });
    }
  });

  it('deletes only an owned song and reports a repeated delete as not found', async () => {
    seedSong({ id: 7, artistId: 10 });

    const deleted = await apiRequest('DELETE', '/api/songs/7', { user: artist });
    expect(deleted.status).toBe(204);
    expect(deleted.text).toBe('');
    expect(state.songs).toHaveLength(0);

    const repeated = await apiRequest('DELETE', '/api/songs/7', { user: artist });
    expect(repeated.status).toBe(404);
    expect(repeated.body).toEqual({ error: 'Song not found.' });
  });
});
