const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');

process.env.DB_HOST ||= '127.0.0.1';
process.env.DB_USER ||= 'test';
process.env.DB_NAME ||= 'test';
process.env.USER_TOKEN_SECRET ||= 'c'.repeat(64);

const { createApp } = require('../index');
const userAuth = require('../middleware/userAuth');

const apiKeys = [
	{ consumerId: 'development', value: 'a'.repeat(64) },
	{ consumerId: 'ring-partner', value: 'b'.repeat(64) },
];

async function listen(server, port = 0) {
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(port, '127.0.0.1', resolve);
	});
	return server.address().port;
}

test('artisans data fails gracefully and recovers when the partner restarts', async (t) => {
	const originalArtisansApiUrl = process.env.ARTISANS_API_URL;
	const originalArtisansApiKey = process.env.ARTISANS_API_KEY;
	const originalConsoleError = console.error;
	const errors = [];
	const receivedApiKeys = [];
	let artisans = [{ id: 1, name: 'Live artisan', service: 'Sound' }];
	const artisansServer = createServer((req, res) => {
		receivedApiKeys.push(req.headers['x-api-key']);
		res.writeHead(200, { 'Content-Type': 'application/json' });
		const artisanId = req.url.match(/^\/api\/artisans\/(\d+)$/)?.[1];
		const response = artisanId
			? { ...artisans.find(({ id }) => String(id) === artisanId), phone: '555-0101' }
			: artisans;
		res.end(JSON.stringify(response));
	});
	const artisansPort = await listen(artisansServer);
	process.env.ARTISANS_API_URL = `http://127.0.0.1:${artisansPort}/api/artisans`;
	process.env.ARTISANS_API_KEY = 'test-artisans-api-key';
	console.error = (...args) => errors.push(args.join(' '));

	t.after(async () => {
		console.error = originalConsoleError;
		if (originalArtisansApiUrl === undefined) delete process.env.ARTISANS_API_URL;
		else process.env.ARTISANS_API_URL = originalArtisansApiUrl;
		if (originalArtisansApiKey === undefined) delete process.env.ARTISANS_API_KEY;
		else process.env.ARTISANS_API_KEY = originalArtisansApiKey;
		if (artisansServer.listening) {
			await new Promise((resolve) => artisansServer.close(resolve));
		}
	});

	const apiServer = createServer(createApp({ apiKeys }));
	const apiPort = await listen(apiServer);
	t.after(() => new Promise((resolve) => apiServer.close(resolve)));

	const baseUrl = `http://127.0.0.1:${apiPort}`;
	const headers = {
		Authorization: `Bearer ${userAuth.issueUserToken({ id: 8, role: 'venue' })}`,
	};
	const getArtisans = () => fetch(`${baseUrl}/client-api/artisans`, { headers });

	const working = await getArtisans();
	assert.equal(working.status, 200);
	assert.deepEqual(await working.json(), [{
		id: 1,
		name: 'Live artisan',
		service: 'Sound',
		phone: '555-0101',
	}]);
	assert.deepEqual(receivedApiKeys, ['test-artisans-api-key', 'test-artisans-api-key']);

	const directBrowserResponse = await fetch(`${baseUrl}/api/artisans`, {
		headers: { ...headers, Origin: 'http://localhost:5173' },
	});
	assert.equal(directBrowserResponse.status, 200);
	assert.deepEqual(await directBrowserResponse.json(), [{
		id: 1,
		name: 'Live artisan',
		service: 'Sound',
		phone: '555-0101',
	}]);
	assert.deepEqual(receivedApiKeys, [
		'test-artisans-api-key',
		'test-artisans-api-key',
		'test-artisans-api-key',
		'test-artisans-api-key',
	]);

	await new Promise((resolve) => artisansServer.close(resolve));
	const unavailable = await getArtisans();
	assert.equal(unavailable.status, 502);
	assert.deepEqual(await unavailable.json(), {
		message: 'Artisans data is currently unavailable.',
	});
	assert.ok(errors.some((line) => line.includes('ECONNREFUSED')), errors.join('\n'));

	const ownBackend = await fetch(`${baseUrl}/`, {
		headers: { 'X-API-Key': apiKeys[0].value },
	});
	assert.equal(ownBackend.status, 200);
	assert.deepEqual(await ownBackend.json(), { message: 'Artist API is running' });

	artisans = [{ id: 2, name: 'Recovered artisan', service: 'Lighting' }];
	await listen(artisansServer, artisansPort);
	const recovered = await getArtisans();
	assert.equal(recovered.status, 200);
	assert.deepEqual(await recovered.json(), [{
		id: 2,
		name: 'Recovered artisan',
		service: 'Lighting',
		phone: '555-0101',
	}]);
});
