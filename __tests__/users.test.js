const { afterEach, describe, expect, it } = require('@jest/globals');
const {
  apiRequest,
  database: { resetDatabase, seedUser, state },
} = require('./support/api');

function registration(overrides = {}) {
  return {
    name: 'Amina Artist',
    email: 'amina@example.test',
    password: 'a-strong-password',
    role: 'artist',
    ...overrides,
  };
}

describe('users API', () => {
  afterEach(resetDatabase);

  it('registers a user without exposing or storing the raw password', async () => {
    const body = registration();
    const response = await apiRequest('POST', '/api/users', { body });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: expect.any(Number),
      name: body.name,
      email: body.email,
      role: body.role,
    });

    expect(response.body).not.toHaveProperty('password');
    expect(state.users).toHaveLength(1);
    expect(state.users[0].password).not.toBe(body.password);
  });

  it('supports registration through the /users alias and rejects duplicate email addresses', async () => {
    seedUser({ id: 8, email: 'amina@example.test' });

    const duplicate = await apiRequest('POST', '/users', { body: registration() });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({ error: 'This email is already registered.' });
    expect(state.users).toHaveLength(1);
  });

  it.each([
    [{ name: 'Amina', password: 'a-strong-password', role: 'artist' }],
    [{ ...registration(), name: '' }],
    [{ ...registration(), email: 12 }],
    [{ ...registration(), password: '' }],
    [{ ...registration(), role: 'admin' }],
  ])('rejects missing or invalid registration fields', async (body) => {
    const response = await apiRequest('POST', '/api/users', { body });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Name, email, password, and a valid role are required.',
    });
    expect(state.users).toHaveLength(0);
  });

  it('authenticates valid credentials through the /users/login alias and returns a usable token', async () => {
    seedUser({ id: 8, name: 'Amina Artist', email: 'amina@example.test', password: 'correct-password' });

    const response = await apiRequest('POST', '/users/login', {
      body: { email: 'AMINA@example.test', password: 'correct-password' },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 8,
      name: 'Amina Artist',
      email: 'amina@example.test',
      role: 'artist',
      accessToken: expect.any(String),
      expiresIn: 3600,
    });
    expect(response.body).not.toHaveProperty('password');
    expect(typeof response.body.expiresIn).toBe('number');

    const ownAccount = await apiRequest('GET', '/users/8', {
      user: response.body.accessToken,
    });
    expect(ownAccount.status).toBe(200);
    expect(ownAccount.body.id).toBe(8);
  });

  it('rejects incomplete and incorrect login credentials with distinct contract responses', async () => {
    seedUser({ id: 8, email: 'amina@example.test', password: 'correct-password' });

    const missing = await apiRequest('POST', '/api/users/login', {
      body: { email: 'amina@example.test' },
    });
    expect(missing.status).toBe(400);
    expect(missing.body).toEqual({ error: 'Email and password are required.' });

    const incorrect = await apiRequest('POST', '/api/users/login', {
      body: { email: 'amina@example.test', password: 'wrong-password' },
    });
    expect(incorrect.status).toBe(401);
    expect(incorrect.body).toEqual({ error: 'Invalid email or password.' });

    const unknown = await apiRequest('POST', '/api/users/login', {
      body: { email: 'unknown@example.test', password: 'correct-password' },
    });
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual({ error: 'Invalid email or password.' });
  });

  it('returns only the authenticated account through the list endpoint and its alias', async () => {
    seedUser({ id: 8, email: 'amina@example.test' });
    seedUser({ id: 9, email: 'other@example.test', role: 'venue' });

    for (const path of ['/api/users', '/users']) {
      const response = await apiRequest('GET', path, { user: { id: 8, role: 'artist' } });
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        id: 8,
        email: 'amina@example.test',
        role: 'artist',
        createdAt: expect.any(String),
      });

      expect(response.body[0]).not.toHaveProperty('password');
    }
  });

  it('returns an empty user list when the authenticated account no longer exists', async () => {
    const response = await apiRequest('GET', '/api/users', {
      user: { id: 8, role: 'artist' },
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('returns owned user details and hides nonexistent or other users', async () => {
    seedUser({ id: 8, email: 'amina@example.test' });

    const found = await apiRequest('GET', '/api/users/8', {
      user: { id: 8, role: 'artist' },
    });
    expect(found.status).toBe(200);
    expect(found.body).toMatchObject({ id: 8, email: 'amina@example.test', role: 'artist' });
    expect(found.body).not.toHaveProperty('password');

    const aliasFound = await apiRequest('GET', '/users/8', {
      user: { id: 8, role: 'artist' },
    });
    expect(aliasFound.status).toBe(200);
    expect(aliasFound.body.id).toBe(8);

    for (const id of ['9', 'not-an-id']) {
      const hidden = await apiRequest('GET', `/api/users/${id}`, {
        user: { id: 8, role: 'artist' },
      });
      expect(hidden.status).toBe(404);
      expect(hidden.body).toEqual({ error: 'Not found.' });
    }

    const missing = await apiRequest('GET', '/api/users/9999', {
      user: { id: 9999, role: 'artist' },
    });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: 'User not found.' });
  });

  it('updates owned user fields and persists the new values', async () => {
    seedUser({ id: 8, email: 'amina@example.test' });

    const response = await apiRequest('PUT', '/users/8', {
      user: { id: 8, role: 'artist' },
      body: { name: 'Amina Updated', email: 'updated@example.test' },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 8,
      name: 'Amina Updated',
      email: 'updated@example.test',
      role: 'artist',
      createdAt: expect.any(String),
    });
    expect(response.body).not.toHaveProperty('password');
    expect(state.users[0]).toMatchObject({ name: 'Amina Updated', email: 'updated@example.test' });

    const apiPrefixUpdate = await apiRequest('PUT', '/api/users/8', {
      user: { id: 8, role: 'artist' },
      body: { name: 'Amina Again', email: 'again@example.test' },
    });
    expect(apiPrefixUpdate.status).toBe(200);
    expect(state.users[0]).toMatchObject({ name: 'Amina Again', email: 'again@example.test' });
  });

  it.each([
    [{ email: 'valid@example.test' }],
    [{ name: '', email: 'valid@example.test' }],
    [{ name: 'Amina', email: 42 }],
    [{ name: 'Amina', email: 'valid@example.test', password: '' }],
  ])('rejects invalid account updates without changing the user', async (body) => {
    const original = seedUser({ id: 8, email: 'amina@example.test' });

    const response = await apiRequest('PUT', '/api/users/8', {
      user: { id: 8, role: 'artist' },
      body,
    });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
    expect(state.users[0]).toEqual(original);
  });

  it('returns 404 for updates and deletes of missing users', async () => {
    const update = await apiRequest('PUT', '/api/users/8', {
      user: { id: 8, role: 'artist' },
      body: { name: 'Amina', email: 'amina@example.test' },
    });
    expect(update.status).toBe(404);
    expect(update.body).toEqual({ error: 'User not found.' });

    const deletion = await apiRequest('DELETE', '/api/users/8', {
      user: { id: 8, role: 'artist' },
    });
    expect(deletion.status).toBe(404);
    expect(deletion.body).toEqual({ error: 'User not found.' });
  });

  it('deletes an owned account and returns no content', async () => {
    seedUser({ id: 8, email: 'amina@example.test' });

    const response = await apiRequest('DELETE', '/users/8', {
      user: { id: 8, role: 'artist' },
    });

    expect(response.status).toBe(204);
    expect(response.text).toBe('');

    seedUser({ id: 8, email: 'amina@example.test' });
    const apiPrefixDelete = await apiRequest('DELETE', '/api/users/8', {
      user: { id: 8, role: 'artist' },
    });
    expect(apiPrefixDelete.status).toBe(204);
    expect(apiPrefixDelete.text).toBe('');
    expect(state.users).toHaveLength(0);
  });
});
