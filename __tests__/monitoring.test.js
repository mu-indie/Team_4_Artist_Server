const { afterEach, describe, expect, it } = require('@jest/globals');
const crypto = require('node:crypto');
const request = require('supertest');
const { createApp } = require('../index');
const { API_KEY, apiKeys } = require('./support/api');

describe('request monitoring', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('logs safe request metadata and fingerprints only successfully authenticated keys', async () => {
		const log = jest.spyOn(console, 'log').mockImplementation(() => {});
		const app = createApp({ apiKeys });
		const valid = await request(app)
			.get('/?search=query-secret')
			.set('X-API-Key', API_KEY)
			.set('Authorization', 'Bearer header-secret');
		const wrong = await request(app).get('/').set('X-API-Key', 'f'.repeat(64));
		const missing = await request(app).get('/');
		const body = await request(app)
			.post('/api/users')
			.set('X-API-Key', API_KEY)
			.send({ email: 'body-secret@example.com', password: 'password-secret' });

		expect(valid.status).toBe(200);
		expect(wrong.status).toBe(401);
		expect(missing.status).toBe(401);
		expect(body.status).toBe(400);

		const lines = log.mock.calls.map(([line]) => JSON.parse(line));
		expect(lines).toHaveLength(4);
		expect(lines[0]).toEqual(expect.objectContaining({
			method: 'GET',
			path: '/',
			status: 200,
			caller: `key-${crypto.createHash('sha256').update(API_KEY).digest('hex').slice(0, 6)}`,
		}));
		expect(lines[0].ms).toBe(Math.round(lines[0].ms * 10) / 10);
		expect(lines[1].caller).toBe('none');
		expect(lines[2].caller).toBe('none');
		expect(lines[3]).toEqual(expect.objectContaining({ path: '/api/users', status: 400 }));

		const output = log.mock.calls.map(([line]) => line).join('\n');
		for (const secret of [
			API_KEY,
			'f'.repeat(64),
			'query-secret',
			'header-secret',
			'body-secret@example.com',
			'password-secret',
		]) {
			expect(output).not.toContain(secret);
		}
	});

	it('protects /stats with an API key and returns the complete stats shape', async () => {
		const log = jest.spyOn(console, 'log').mockImplementation(() => {});
		const app = createApp({ apiKeys });
		const unauthorized = await request(app).get('/stats');
		const authorized = await request(app).get('/stats').set('X-API-Key', API_KEY);

		expect(unauthorized.status).toBe(401);
		expect(authorized.status).toBe(200);
		expect(authorized.body).toEqual(expect.objectContaining({
			startedAt: expect.any(String),
			uptimeSeconds: expect.any(Number),
			total: expect.any(Number),
			clientErrors: expect.any(Number),
			serverErrors: expect.any(Number),
			errorRatePercent: expect.any(Number),
			avgMs: expect.any(Number),
			routes: expect.any(Object),
		}));
		for (const route of Object.values(authorized.body.routes)) {
			expect(route).toEqual(expect.objectContaining({
				count: expect.any(Number),
				clientErrors: expect.any(Number),
				serverErrors: expect.any(Number),
				avgMs: expect.any(Number),
				maxMs: expect.any(Number),
			}));
		}
	});

	it('logs rate-limited requests and groups them without raw path values', async () => {
		const log = jest.spyOn(console, 'log').mockImplementation(() => {});
		const app = createApp({
			apiKeys,
			rateLimit: { maxRequests: 1, windowMs: 60_000 },
		});
		const allowed = await request(app).get('/').set('X-API-Key', API_KEY);
		const limited = await request(app).get('/').set('X-API-Key', API_KEY);

		expect(allowed.status).toBe(200);
		expect(limited.status).toBe(429);
		const lines = log.mock.calls.map(([line]) => JSON.parse(line));
		expect(lines[1]).toEqual(expect.objectContaining({
			path: '/',
			status: 429,
			caller: `key-${crypto.createHash('sha256').update(API_KEY).digest('hex').slice(0, 6)}`,
		}));
	});
});
