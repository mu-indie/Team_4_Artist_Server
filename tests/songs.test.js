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

function songFor(userId = 1536) {
	return {
		artistId: userId,
		title: 'Test Song',
		genre: 'Jazz',
		description: 'A new song.',
		audioUrl: 'https://example.test/song.mp3',
		coverImage: 'https://example.test/cover.jpg',
		uploadDate: '2026-11-02',
	};
}

async function postSong(baseUrl, token, song) {
	return fetch(`${baseUrl}/api/songs`, {
		method: 'POST',
		headers: {
			Origin: 'http://localhost:5173',
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(song),
	});
}

test('song creation rejects invalid database-bound fields before querying MySQL', async (t) => {
	const originalQuery = db.query;
	let queryCount = 0;
	db.query = async () => {
		queryCount += 1;
		return [{ insertId: 1 }, []];
	};
	t.after(() => {
		db.query = originalQuery;
	});

	const baseUrl = await listen(t, createApp({ apiKeys }));
	const token = userAuth.issueUserToken({ id: 1536, role: 'artist' });
	const invalidSongs = [
		[{ ...songFor(), title: ' ' }, 'title is required.'],
		[{ ...songFor(), title: 'x'.repeat(256) }, 'title must be 255 characters or fewer.'],
		[{ ...songFor(), audioUrl: 'x'.repeat(501) }, 'audioUrl must be 500 characters or fewer.'],
		[{ ...songFor(), description: '🙂'.repeat(16384) }, 'description must be 65,535 UTF-8 bytes or fewer.'],
		[{ ...songFor(), uploadDate: '2026-02-30' }, 'uploadDate must be a valid date in YYYY-MM-DD format.'],
	];

	for (const [song, expectedError] of invalidSongs) {
		const response = await postSong(baseUrl, token, song);
		assert.equal(response.status, 400);
		assert.deepEqual(await response.json(), { error: expectedError });
	}
	assert.equal(queryCount, 0, 'invalid song fields must not reach MySQL');
});

test('song creation inserts schema-compatible fields and returns the created record', async (t) => {
	const originalQuery = db.query;
	const createdSong = { id: 9, ...songFor() };
	let insertParameters;
	db.query = async (sql, parameters) => {
		if (sql.includes('INSERT INTO songs')) {
			insertParameters = parameters;
			return [{ insertId: createdSong.id }, []];
		}
		if (sql.includes('FROM songs') && sql.includes('WHERE id = ?')) {
			return [[createdSong], []];
		}
		throw new Error('Unexpected song query');
	};
	t.after(() => {
		db.query = originalQuery;
	});

	const baseUrl = await listen(t, createApp({ apiKeys }));
	const token = userAuth.issueUserToken({ id: 1536, role: 'artist' });
	const response = await postSong(baseUrl, token, songFor());

	assert.equal(response.status, 201);
	assert.deepEqual(await response.json(), createdSong);
	assert.deepEqual(insertParameters, [
		1536,
		'Test Song',
		'Jazz',
		'A new song.',
		'https://example.test/song.mp3',
		'https://example.test/cover.jpg',
		'2026-11-02',
	]);
});

test('song creation reports a missing database artist as a client error', async (t) => {
	const originalQuery = db.query;
	db.query = async () => {
		const error = new Error('Foreign key constraint failed');
		error.code = 'ER_NO_REFERENCED_ROW_2';
		throw error;
	};
	t.after(() => {
		db.query = originalQuery;
	});

	const baseUrl = await listen(t, createApp({ apiKeys }));
	const token = userAuth.issueUserToken({ id: 1536, role: 'artist' });
	const response = await postSong(baseUrl, token, songFor());

	assert.equal(response.status, 400);
	assert.deepEqual(await response.json(), {
		error: 'The artist account associated with this song no longer exists.',
	});
});
