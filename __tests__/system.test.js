const { afterEach, describe, expect, it } = require('@jest/globals');
const {
  apiRequest,
  database: { resetDatabase, state },
} = require('./support/api');

describe('API status and common errors', () => {
  afterEach(resetDatabase);

  it('serves the API status when a valid API key is supplied', async () => {
    const response = await apiRequest('GET', '/');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Artist API is running' });
  });

  it('rejects API requests without a valid API key', async () => {
    const response = await apiRequest('GET', '/', { key: '' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: 'Missing or invalid API key' });
  });

  it('reports database health without requiring an API key', async () => {
    const response = await apiRequest('GET', '/api/health', { key: undefined });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ api: 'ok', database: 'connected' });
    expect(state.queries).toContainEqual({ statement: 'SELECT 1', parameters: [] });
  });

  it('returns 503 when the database health check fails', async () => {
    state.healthError = true;
    const originalConsoleError = console.error;
    console.error = jest.fn();
    try {
      const response = await apiRequest('GET', '/api/health', { key: undefined });

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ api: 'ok', database: 'disconnected' });
      expect(console.error).toHaveBeenCalledTimes(1);
    } finally {
      console.error = originalConsoleError;
    }
  });

  it('returns the standard JSON not-found response for unknown routes', async () => {
    const response = await apiRequest('GET', '/api/no-such-resource');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not found.' });
  });

  it('rejects malformed JSON with a clear 400 response', async () => {
    const response = await apiRequest('POST', '/api/users', { body: '{' })
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid JSON request body.' });
  });

  it('does not expose PATCH handlers where the API defines no PATCH operations', async () => {
    const response = await apiRequest('PATCH', '/api/songs/1', { body: { title: 'Patched' } });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not found.' });
  });
});
