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

function profile(location) {
  return {
    stageName: 'Artist',
    genre: 'Jazz',
    bio: 'A short artist bio.',
    location,
    performanceFee: 500,
  };
}

test('artist profiles accept multiple supported counties and store them together', async (t) => {
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
  const token = userAuth.issueUserToken({ id: 17, role: 'artist' });
  const response = await fetch(`${baseUrl}/api/profiles/artists/17`, {
    method: 'PUT',
    headers: {
      'X-API-Key': apiKeys[0].value,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(profile('Nairobi, Mombasa, Taita–Taveta, Nakuru')),
  });

  assert.equal(response.status, 200);
  assert.equal(queryParameters[4], 'Nairobi, Mombasa, Taita–Taveta, Nakuru');
});

test('artist profile locations reject unsupported and duplicate counties before database writes', async (t) => {
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
  const token = userAuth.issueUserToken({ id: 17, role: 'artist' });
  for (const location of [
    'London',
    'Nairobi, London',
    'Nairobi, Nairobi',
    'Nairobi, Nakuru, Narok, Mombasa, Kwale',
  ]) {
    const response = await fetch(`${baseUrl}/api/profiles/artists/17`, {
      method: 'PUT',
      headers: {
        'X-API-Key': apiKeys[0].value,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(profile(location)),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: 'location must contain up to 4 unique supported Kenyan counties separated by commas.',
    });
  }
  assert.equal(queryCalls, 0);
});
