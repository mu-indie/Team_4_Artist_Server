const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
process.env.USER_TOKEN_SECRET ||= 'c'.repeat(64);
const { createUserAuth, TOKEN_TTL_SECONDS } = require('../middleware/userAuth');

async function listen(t, app) {
	const server = await new Promise((resolve, reject) => {
		const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
		instance.once('error', reject);
	});
	t.after(() => new Promise((resolve) => server.close(resolve)));
	return `http://127.0.0.1:${server.address().port}`;
}

test('user tokens are signed, time-limited, and reject tampering', () => {
	let now = 1_800_000_000_000;
	const auth = createUserAuth({ secret: Buffer.alloc(32, 0x44), now: () => now });
	const token = auth.issueUserToken({ id: 12, role: 'artist' });

	assert.deepEqual(auth.verifyUserToken(token), { id: 12, role: 'artist' });
	assert.equal(auth.verifyUserToken(`${token}x`), undefined);
	now += (TOKEN_TTL_SECONDS + 1) * 1000;
	assert.equal(auth.verifyUserToken(token), undefined);
});

test('owner and role guards reject other users before protected handlers', async (t) => {
	const auth = createUserAuth({ secret: Buffer.alloc(32, 0x55) });
	const ownToken = auth.issueUserToken({ id: 12, role: 'artist' });
	const venueToken = auth.issueUserToken({ id: 30, role: 'venue' });
	const app = express();
	let handlerCalls = 0;

	app.get('/users/:id', auth.requireUser, auth.requireOwner('id'), (req, res) => {
		handlerCalls += 1;
		res.json({ id: req.user.id });
	});
	app.get('/artist-write', auth.requireUser, auth.requireRole('artist'), (req, res) => {
		handlerCalls += 1;
		res.json({ ok: true });
	});
	const baseUrl = await listen(t, app);

	const missing = await fetch(`${baseUrl}/users/12`);
	assert.equal(missing.status, 401);
	const foreign = await fetch(`${baseUrl}/users/13`, {
		headers: { Authorization: `Bearer ${ownToken}` },
	});
	assert.equal(foreign.status, 404);
	const own = await fetch(`${baseUrl}/users/12`, {
		headers: { Authorization: `Bearer ${ownToken}` },
	});
	assert.equal(own.status, 200);
	const wrongRole = await fetch(`${baseUrl}/artist-write`, {
		headers: { Authorization: `Bearer ${venueToken}` },
	});
	assert.equal(wrongRole.status, 403);
	assert.equal(handlerCalls, 1);
});
