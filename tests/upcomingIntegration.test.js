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

test('upcoming tasks are available through the authenticated frontend API proxy', async (t) => {
	const originalPartnerUrl = process.env.PARTNER_URL;
	const originalPartnerApiKey = process.env.PARTNER_API_KEY;
	const partnerApiKeys = [];
	const partnerServer = createServer((req, res) => {
		partnerApiKeys.push(req.headers['x-api-key']);
		assert.equal(req.url, '/tasks?status=active');
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify([
			{ title: 'Live event', dueDate: '2026-12-01' },
			{ title: 'Legacy event', due_date: '2026-12-02' },
		]));
	});

	await new Promise((resolve, reject) => {
		partnerServer.once('error', reject);
		partnerServer.listen(0, '127.0.0.1', resolve);
	});
	process.env.PARTNER_URL = `http://127.0.0.1:${partnerServer.address().port}`;
	process.env.PARTNER_API_KEY = 'test-partner-api-key';

	const apiServer = createServer(createApp({ apiKeys }));
	await new Promise((resolve, reject) => {
		apiServer.once('error', reject);
		apiServer.listen(0, '127.0.0.1', resolve);
	});

	t.after(async () => {
		if (originalPartnerUrl === undefined) delete process.env.PARTNER_URL;
		else process.env.PARTNER_URL = originalPartnerUrl;
		if (originalPartnerApiKey === undefined) delete process.env.PARTNER_API_KEY;
		else process.env.PARTNER_API_KEY = originalPartnerApiKey;
		await Promise.all([partnerServer, apiServer].map((server) => new Promise((resolve) => {
			server.close(resolve);
		})));
	});

	const baseUrl = `http://127.0.0.1:${apiServer.address().port}`;
	const anonymous = await fetch(`${baseUrl}/client-api/upcoming`);
	assert.equal(anonymous.status, 401);

	const headers = {
		Authorization: `Bearer ${userAuth.issueUserToken({ id: 8, role: 'venue' })}`,
	};
	const response = await fetch(`${baseUrl}/client-api/upcoming`, { headers });
	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), [
		{ title: 'Live event', dueDate: '2026-12-01' },
		{ title: 'Legacy event', dueDate: '2026-12-02' },
	]);

	const directBrowserResponse = await fetch(`${baseUrl}/api/upcoming`, {
		headers: { ...headers, Origin: 'http://localhost:5173' },
	});
	assert.equal(directBrowserResponse.status, 200);
	assert.deepEqual(await directBrowserResponse.json(), [
		{ title: 'Live event', dueDate: '2026-12-01' },
		{ title: 'Legacy event', dueDate: '2026-12-02' },
	]);
	assert.deepEqual(partnerApiKeys, ['test-partner-api-key', 'test-partner-api-key']);
});
