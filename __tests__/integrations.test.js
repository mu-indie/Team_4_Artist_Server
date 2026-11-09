const { createServer } = require('node:http');
const { afterEach, describe, expect, it } = require('@jest/globals');
const {
  apiRequest,
  database: { resetDatabase },
} = require('./support/api');

const originalEnv = {};
const changedEnv = ['PARTNER_URL', 'PARTNER_API_KEY', 'ARTISANS_API_URL', 'ARTISANS_API_KEY'];

function setEnv(key, value) {
  if (!(key in originalEnv)) originalEnv[key] = process.env[key];
  process.env[key] = value;
}

async function listen(handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

async function close(server) {
  if (!server?.listening) return;
  await new Promise((resolve) => server.close(resolve));
}

describe('partner integrations', () => {
  afterEach(async () => {
    resetDatabase();
    for (const key of changedEnv) {
      if (key in originalEnv) {
        if (originalEnv[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnv[key];
        delete originalEnv[key];
      }
    }
  });

  it('serves active partner tasks at both documented paths and maps legacy due-date fields', async () => {
    const received = [];
    const partner = await listen((req, res) => {
      received.push({ url: req.url, key: req.headers['x-api-key'] });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([
        { title: 'Current format', dueDate: '2026-12-01' },
        { title: 'Legacy format', due_date: '2026-12-02' },
        { title: 'Deadline format', deadline: '2026-12-03' },
      ]));
    });
    setEnv('PARTNER_URL', `http://127.0.0.1:${partner.address().port}`);
    setEnv('PARTNER_API_KEY', 'test-partner-key');

    try {
      for (const path of ['/upcoming', '/api/upcoming']) {
        const response = await apiRequest('GET', path);
        expect(response.status).toBe(200);
        expect(response.body).toEqual([
          { title: 'Current format', dueDate: '2026-12-01' },
          { title: 'Legacy format', dueDate: '2026-12-02' },
          { title: 'Deadline format', dueDate: '2026-12-03' },
        ]);
      }
      expect(received).toEqual([
        { url: '/tasks?status=active', key: 'test-partner-key' },
        { url: '/tasks?status=active', key: 'test-partner-key' },
      ]);
    } finally {
      await close(partner);
    }
  });

  it('returns an explicit 503 when the upcoming-task integration is unconfigured', async () => {
    setEnv('PARTNER_URL', '');
    setEnv('PARTNER_API_KEY', '');

    const response = await apiRequest('GET', '/upcoming');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ message: 'Partner integration is not configured.' });
  });

  it('requires a user token for upcoming tasks accessed through the browser proxy', async () => {
    setEnv('PARTNER_URL', '');
    setEnv('PARTNER_API_KEY', '');

    const anonymous = await apiRequest('GET', '/client-api/upcoming');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toEqual({ message: 'Missing or invalid user access token' });

    const authenticated = await apiRequest('GET', '/client-api/upcoming', {
      user: { id: 20, role: 'venue' },
    });
    expect(authenticated.status).toBe(503);
    expect(authenticated.body).toEqual({ message: 'Partner integration is not configured.' });
  });

  it('returns 502 when the partner responds with an error', async () => {
    const partner = await listen((_req, res) => {
      res.writeHead(503);
      res.end();
    });
    setEnv('PARTNER_URL', `http://127.0.0.1:${partner.address().port}`);
    setEnv('PARTNER_API_KEY', 'test-partner-key');
    const originalConsoleError = console.error;
    console.error = jest.fn();

    try {
      const response = await apiRequest('GET', '/api/upcoming');
      expect(response.status).toBe(502);
      expect(response.body).toEqual({ message: 'Partner data unavailable' });
    } finally {
      console.error = originalConsoleError;
      await close(partner);
    }
  });

  it('returns artisans enriched with phone numbers from each detail endpoint', async () => {
    const requests = [];
    const artisans = await listen((req, res) => {
      requests.push({ url: req.url, key: req.headers['x-api-key'] });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const id = req.url.match(/\/(\d+)$/)?.[1];
      res.end(JSON.stringify(id
        ? { data: { phone: `555-010${id}` } }
        : [{ id: 1, name: 'First artisan' }, { id: 2, name: 'Second artisan', phone: 'old-number' }]));
    });
    setEnv('ARTISANS_API_URL', `http://127.0.0.1:${artisans.address().port}/api/artisans`);
    setEnv('ARTISANS_API_KEY', 'test-artisans-key');

    try {
      const response = await apiRequest('GET', '/api/artisans');
      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        { id: 1, name: 'First artisan', phone: '555-0101' },
        { id: 2, name: 'Second artisan', phone: '555-0102' },
      ]);
      expect(requests).toEqual([
        { url: '/api/artisans', key: 'test-artisans-key' },
        { url: '/api/artisans/1', key: 'test-artisans-key' },
        { url: '/api/artisans/2', key: 'test-artisans-key' },
      ]);
    } finally {
      await close(artisans);
    }
  });

  it('returns 503 when the artisans integration is unconfigured', async () => {
    setEnv('ARTISANS_API_URL', '');
    setEnv('ARTISANS_API_KEY', '');

    const response = await apiRequest('GET', '/api/artisans');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ message: 'Artisans integration is not configured.' });
  });
});
