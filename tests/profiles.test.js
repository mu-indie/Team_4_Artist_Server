const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= '127.0.0.1';
process.env.DB_USER ||= 'test';
process.env.DB_NAME ||= 'test';
process.env.USER_TOKEN_SECRET ||= 'c'.repeat(64);

const { createApp } = require('../index');
const userAuth = require('../middleware/userAuth');
const db = require('../db');

const apiKeys = [
  { consumerId: 'development', value: 'a'.repeat(64) },
  { consumerId: 'ring-partner', value: 'b'.repeat(64) },
];

async function listen(t, app) {
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    instance.once('error', reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('artist profile save rejects values that exceed database column limits', async (t) => {
  const originalQuery = db.query;
  let queryCalls = 0;
  db.query = async () => {
    queryCalls += 1;
    return [{ affectedRows: 1 }, []];
  };
  t.after(() => {
    db.query = originalQuery;
  });

  const baseUrl = await listen(t, createApp({ apiKeys }));
  const userToken = userAuth.issueUserToken({ id: 17, role: 'artist' });
  const headers = {
    'X-API-Key': apiKeys[0].value,
    Authorization: `Bearer ${userToken}`,
    'Content-Type': 'application/json',
  };
  const profile = {
    stageName: 'Artist',
    genre: 'Jazz',
    bio: 'A short artist bio.',
    location: 'Nairobi',
    performanceFee: 500,
  };

  const tooLongStageName = await fetch(`${baseUrl}/api/profiles/artists/17`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ ...profile, stageName: 'x'.repeat(256) }),
  });
  assert.equal(tooLongStageName.status, 400);
  assert.deepEqual(await tooLongStageName.json(), {
    error: 'stageName must be 255 characters or fewer.',
  });

  const tooLongBio = await fetch(`${baseUrl}/api/profiles/artists/17`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ ...profile, bio: '🙂'.repeat(16384) }),
  });
  assert.equal(tooLongBio.status, 400);
  assert.deepEqual(await tooLongBio.json(), {
    error: 'bio must be 65,535 UTF-8 bytes or fewer.',
  });

  const tooLongOptionalUrl = await fetch(`${baseUrl}/api/profiles/artists/17`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      ...profile,
      socialLinks: { spotify: 'x'.repeat(501) },
    }),
  });
  assert.equal(tooLongOptionalUrl.status, 400);
  assert.deepEqual(await tooLongOptionalUrl.json(), {
    error: 'spotify must be 500 characters or fewer.',
  });

  for (const location of ['London', 'Nairobi, London', 'Nairobi, Nairobi']) {
    const invalidLocation = await fetch(`${baseUrl}/api/profiles/artists/17`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ ...profile, location }),
    });
    assert.equal(invalidLocation.status, 400);
    assert.deepEqual(await invalidLocation.json(), {
      error: 'location must contain up to 4 unique supported Kenyan counties separated by commas.',
    });
  }
  assert.equal(queryCalls, 0, 'invalid profiles must not reach the database');
});

test('artist profile save supports omitted optional fields', async (t) => {
  const originalQuery = db.query;
  let queryParameters;
  db.query = async (_sql, parameters) => {
    queryParameters = parameters;
    return [{ affectedRows: 1 }, []];
  };
  t.after(() => {
    db.query = originalQuery;
  });


  const baseUrl = await listen(t, createApp({ apiKeys }));
  const userToken = userAuth.issueUserToken({ id: 17, role: 'artist' });
  const response = await fetch(`${baseUrl}/api/profiles/artists/17`, {
    method: 'PUT',
    headers: {
      'X-API-Key': apiKeys[0].value,
      Authorization: `Bearer ${userToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      stageName: 'Artist',
      genre: 'Jazz',
      bio: 'A short artist bio.',
      location: 'Nairobi',
      performanceFee: 500,
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    message: 'Artist profile saved successfully.',
  });
  assert.deepEqual(queryParameters.slice(6), [null, null, null, null]);
});
