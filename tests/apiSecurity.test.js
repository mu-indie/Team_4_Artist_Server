const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

process.env.DB_HOST ||= '127.0.0.1';
process.env.DB_USER ||= 'test';
process.env.DB_NAME ||= 'test';
process.env.USER_TOKEN_SECRET ||= 'c'.repeat(64);

const { createApp } = require('../index');
const { createApiSecurity, readApiKeys } = require('../middleware/apiSecurity');
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

test('missing and invalid keys receive the same 401 response', async (t) => {
	const baseUrl = await listen(t, createApp({ apiKeys }));

	for (const headers of [{}, { 'X-API-Key': 'invalid' }]) {
		const response = await fetch(`${baseUrl}/`, { headers });
		assert.equal(response.status, 401);
		assert.deepEqual(await response.json(), { message: 'Missing or invalid API key' });
	}
});

test('a valid key reaches an existing protected endpoint', async (t) => {
	const baseUrl = await listen(t, createApp({ apiKeys }));
	const response = await fetch(`${baseUrl}/`, {
		headers: { 'X-API-Key': apiKeys[0].value },
	});

	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), { message: 'Artist API is running' });
});

test('frontend proxy injects the server key and requires user tokens except for auth bootstrap', async (t) => {
	const originalQuery = db.query;
	let loginQueries = 0;
	db.query = async (sql) => {
		if (sql.includes('FROM artists')) {
			return [[{ id: 7, name: 'Test Artist', genre: 'Jazz', bio: 'A public artist record' }], []];
		}
		if (sql.includes('LOWER(email)')) {
			loginQueries += 1;
			return [[], []];
		}
		if (sql.includes('FROM users')) {
			return [[{ id: 7, name: 'Test User', email: 'test@example.com', role: 'artist' }], []];
		}
		if (sql === 'SELECT 1') return [[{ 1: 1 }], []];
		throw new Error('Unexpected database query');
	};
	t.after(() => {
		db.query = originalQuery;
	});

	const baseUrl = await listen(t, createApp({ apiKeys }));
	const anonymousArtists = await fetch(`${baseUrl}/client-api/artists`);
	assert.equal(anonymousArtists.status, 401);

	const login = await fetch(`${baseUrl}/client-api/users/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email: 'missing@example.com', password: 'password' }),
	});
	assert.equal(login.status, 401);
	assert.deepEqual(await login.json(), { error: 'Invalid email or password.' });
	assert.equal(loginQueries, 1, 'login is forwarded through the API-key-authenticated route');

	const health = await fetch(`${baseUrl}/client-api/health`);
	assert.equal(health.status, 200);
	assert.deepEqual(await health.json(), { api: 'ok', database: 'connected' });

	const token = userAuth.issueUserToken({ id: 7, role: 'artist' });
	const headers = { Authorization: `Bearer ${token}` };
	const artists = await fetch(`${baseUrl}/client-api/artists`, { headers });
	assert.equal(artists.status, 200);
	assert.deepEqual(await artists.json(), [
		{ id: 7, name: 'Test Artist', genre: 'Jazz', bio: 'A public artist record' },
	]);

	const missingToken = await fetch(`${baseUrl}/client-api/users/7`);
	assert.equal(missingToken.status, 401);

	const owner = await fetch(`${baseUrl}/client-api/users/7`, {
		headers,
	});
	assert.equal(owner.status, 200);
	assert.equal((await owner.json()).id, 7);
});

test('direct browser /api routes work without a shared key and retain user-token protection', async (t) => {
	const originalQuery = db.query;
	db.query = async () => [[], []];
	t.after(() => {
		db.query = originalQuery;
	});

	const baseUrl = await listen(t, createApp({ apiKeys }));
	const headers = {
		Authorization: `****** id: 7, role: 'artist' })}`,
	};

	const token = userAuth.issueUserToken({ id: 7, role: 'artist' });
	headers.Authorization = `Bearer ${token}`;

	for (const path of [
		'/artists',
		'/songs',
		'/users',
		'/profiles/artists',
		'/bookings',
		'/venues',
	]) {
		const response = await fetch(`${baseUrl}/api${path}`, {
			headers: { ...headers, Origin: 'http://localhost:5173' },
		});
		assert.equal(response.status, 200, `${path} should reach its API route without an API key`);
		assert.deepEqual(await response.json(), [], `${path} should preserve its collection response`);
	}

	const missingToken = await fetch(`${baseUrl}/api/users`, {
		headers: { Origin: 'http://localhost:5173' },
	});
	assert.equal(missingToken.status, 401);

	const noBrowserOrigin = await fetch(`${baseUrl}/api/artists`);
	assert.equal(noBrowserOrigin.status, 401, 'non-browser callers must still provide an API key');
});

test('browser API requests are rate-limited per client IP', async (t) => {
	const originalQuery = db.query;
	db.query = async () => [[], []];
	t.after(() => {
		db.query = originalQuery;
	});

	const baseUrl = await listen(t, createApp({
		apiKeys,
		rateLimit: { maxRequests: 1, windowMs: 60_000 },
	}));
	const token = userAuth.issueUserToken({ id: 7, role: 'artist' });
	const options = {
		headers: {
			Origin: 'http://localhost:5173',
			Authorization: ['Bearer', token].join(' '),
		},
	};
	const first = await fetch(`${baseUrl}/api/artists`, options);
	assert.equal(first.status, 200);

	const limited = await fetch(`${baseUrl}/api/artists`, options);
	assert.equal(limited.status, 429);
	assert.equal(limited.headers.get('retry-after'), '60');
});

test('CORS allows the configured production origin and localhost with credentials and preflight headers', async (t) => {
	const originalFrontendOrigin = process.env.FRONTEND_ORIGIN;
	const originalQuery = db.query;
	process.env.FRONTEND_ORIGIN = 'https://frontend.example.test';
	db.query = async () => [[{ 1: 1 }], []];
	t.after(() => {
		if (originalFrontendOrigin === undefined) delete process.env.FRONTEND_ORIGIN;
		else process.env.FRONTEND_ORIGIN = originalFrontendOrigin;
		db.query = originalQuery;
	});

	const baseUrl = await listen(t, createApp({ apiKeys }));
	for (const origin of ['https://frontend.example.test', 'http://localhost:5173']) {
		const response = await fetch(`${baseUrl}/api/health`, { headers: { Origin: origin } });
		assert.equal(response.status, 200);
		assert.equal(response.headers.get('access-control-allow-origin'), origin);
		assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
	}

	const blockedOrigin = await fetch(`${baseUrl}/api/health`, {
		headers: { Origin: 'https://unconfigured.example.test' },
	});
	assert.equal(blockedOrigin.headers.get('access-control-allow-origin'), null);

	const preflight = await fetch(`${baseUrl}/client-api/bookings`, {
		method: 'OPTIONS',
		headers: {
			Origin: 'https://frontend.example.test',
			'Access-Control-Request-Method': 'POST',
			'Access-Control-Request-Headers': 'authorization,content-type',
		},
	});
	assert.equal(preflight.status, 204);
	assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://frontend.example.test');
	assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
	assert.match(preflight.headers.get('access-control-allow-methods'), /POST/);
	assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/i);
	assert.match(preflight.headers.get('access-control-allow-headers'), /Content-Type/i);
});

test('CORS rejects wildcard or non-origin FRONTEND_ORIGIN configuration', () => {
	const originalFrontendOrigin = process.env.FRONTEND_ORIGIN;
	process.env.FRONTEND_ORIGIN = '*';
	try {
		assert.throws(
			() => createApp({ apiKeys }),
			/FRONTEND_ORIGIN must be an exact HTTP\(S\) origin/,
		);
	} finally {
		if (originalFrontendOrigin === undefined) delete process.env.FRONTEND_ORIGIN;
		else process.env.FRONTEND_ORIGIN = originalFrontendOrigin;
	}
});

test('artist reads need a consumer key but no user token', async (t) => {
	const originalQuery = db.query;
	const artist = { id: 7, name: 'Test Artist', genre: 'Jazz', bio: 'A public artist record' };
	db.query = async () => [[artist], []];
	t.after(() => {
		db.query = originalQuery;
	});

	const baseUrl = await listen(t, createApp({ apiKeys }));
	const headers = { 'X-API-Key': apiKeys[0].value };

	const list = await fetch(`${baseUrl}/api/artists`, { headers });
	assert.equal(list.status, 200);
	assert.deepEqual(await list.json(), [artist]);

	const detail = await fetch(`${baseUrl}/api/artists/7`, { headers });
	assert.equal(detail.status, 200);
	assert.deepEqual(await detail.json(), artist);

	const anonymous = await fetch(`${baseUrl}/api/artists`);
	assert.equal(anonymous.status, 401);
});

test('authentication applies to write methods before route handlers', async (t) => {
	const baseUrl = await listen(t, createApp({ apiKeys }));
	const response = await fetch(`${baseUrl}/api/users`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name: 'Test' }),
	});

	assert.equal(response.status, 401);
	assert.deepEqual(await response.json(), { message: 'Missing or invalid API key' });
});

test('owner-scoped routes require a user token; artist writes require an artist and remain disabled', async (t) => {
	const baseUrl = await listen(t, createApp({ apiKeys }));
	const headers = { 'X-API-Key': apiKeys[0].value, 'Content-Type': 'application/json' };
	const artistToken = userAuth.issueUserToken({ id: 7, role: 'artist' });

	for (const [path, method] of [
		['/api/users', 'GET'],
		['/api/users/1', 'GET'],
		['/api/profiles/artists/1', 'PUT'],
		['/api/songs', 'POST'],
		['/api/bookings', 'POST'],
		['/api/venues', 'POST'],
	]) {
		const response = await fetch(`${baseUrl}${path}`, {
			method,
			headers,
			body: method === 'GET' ? undefined : JSON.stringify({}),
		});
		assert.equal(response.status, 401, `${method} ${path} requires a user token`);
	}

	for (const [path, method] of [
		['/api/artists', 'POST'],
		['/api/artists/7', 'PUT'],
		['/api/artists/7', 'DELETE'],
	]) {
		const unauthenticated = await fetch(`${baseUrl}${path}`, {
			method,
			headers,
			body: method === 'DELETE' ? undefined : JSON.stringify({ name: 'Test' }),
		});
		assert.equal(unauthenticated.status, 401, `${method} ${path} requires a user token`);

		const authenticated = await fetch(`${baseUrl}${path}`, {
			method,
			headers: { ...headers, Authorization: `Bearer ${artistToken}` },
			body: method === 'DELETE' ? undefined : JSON.stringify({ name: 'Test' }),
		});
		assert.equal(authenticated.status, 403, `${method} ${path} remains disabled`);
		assert.match((await authenticated.json()).error, /ownership migration/);
	}

	const wrongRole = await fetch(`${baseUrl}/api/artists`, {
		method: 'POST',
		headers: {
			...headers,
			Authorization: `Bearer ${userAuth.issueUserToken({ id: 12, role: 'venue' })}`,
		},
		body: JSON.stringify({ name: 'Test' }),
	});
	assert.equal(wrongRole.status, 403);
});

test('per-consumer limits return 429 with Retry-After and do not call the handler', async (t) => {
	const app = express();
	const security = createApiSecurity({ apiKeys, maxRequests: 3, windowMs: 60_000 });
	let handlerCalls = 0;
	app.use(security.authenticate);
	app.use(security.rateLimit);
	app.get('/protected', (req, res) => {
		handlerCalls += 1;
		res.json({ consumerId: req.consumerId });
	});
	const baseUrl = await listen(t, app);

	for (const headers of [{}, { 'X-API-Key': 'invalid' }]) {
		const unauthorized = await fetch(`${baseUrl}/protected`, { headers });
		assert.equal(unauthorized.status, 401);
	}
	assert.equal(handlerCalls, 0);

	for (let request = 0; request < 3; request += 1) {
		const allowed = await fetch(`${baseUrl}/protected`, {
			headers: { 'X-API-Key': apiKeys[0].value },
		});
		assert.equal(allowed.status, 200);
	}

	const limited = await fetch(`${baseUrl}/protected`, {
		headers: { 'X-API-Key': apiKeys[0].value },
	});
	assert.equal(limited.status, 429);
	const retryAfter = Number(limited.headers.get('Retry-After'));
	const body = await limited.json();
	assert.equal(body.message, 'Too many requests');
	assert.ok(Number.isInteger(retryAfter) && retryAfter > 0);
	assert.equal(body.retryAfter, retryAfter);
	assert.equal(handlerCalls, 3);

	const otherConsumer = await fetch(`${baseUrl}/protected`, {
		headers: { 'X-API-Key': apiKeys[1].value },
	});
	assert.equal(otherConsumer.status, 200);
	assert.deepEqual(await otherConsumer.json(), { consumerId: 'ring-partner' });
	assert.equal(handlerCalls, 4);
});

test('required keys must be distinct and correctly formatted', () => {
	assert.throws(() => readApiKeys({}), /API_KEY_DEVELOPMENT, API_KEY_PARTNER/);
	assert.throws(() => readApiKeys({
		API_KEY_DEVELOPMENT: 'a'.repeat(64),
		API_KEY_PARTNER: 'a'.repeat(64),
	}), /must be different/);
});
