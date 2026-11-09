process.env.DB_HOST = '127.0.0.1';
process.env.DB_USER = 'jest';
process.env.DB_NAME = 'artist_api_jest_only';
process.env.USER_TOKEN_SECRET = 'c'.repeat(64);

jest.mock('../../db', () => require('./database').db);

const request = require('supertest');
const { createApp } = require('../../index');
const userAuth = require('../../middleware/userAuth');
const database = require('./database');

const API_KEY = 'a'.repeat(64);
const PARTNER_API_KEY = 'b'.repeat(64);
const apiKeys = [
  { consumerId: 'development', value: API_KEY },
  { consumerId: 'ring-partner', value: PARTNER_API_KEY },
];

function userToken(id, role) {
  return userAuth.issueUserToken({ id, role });
}

function apiRequest(method, path, { user, body, key = API_KEY } = {}) {
  const app = createApp({ apiKeys, rateLimit: { maxRequests: 500, windowMs: 60_000 } });
  const call = request(app)[method.toLowerCase()](path);
  if (key) call.set('X-API-Key', key);
  if (user) {
    const token = typeof user === 'string' ? user : userToken(user.id, user.role);
    call.set('Authorization', `Bearer ${token}`);
  }
  if (body !== undefined) call.send(body);
  return call;
}

module.exports = {
  API_KEY,
  PARTNER_API_KEY,
  apiKeys,
  apiRequest,
  database,
  userToken,
};
