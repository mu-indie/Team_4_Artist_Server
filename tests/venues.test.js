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

function venueProfile(overrides = {}) {
	return {
		venueName: 'The Blue Note',
		location: 'Nairobi',
		capacity: 250,
		supportedGenres: 'Jazz, R&B',
		description: 'An intimate live music venue.',
		...overrides,
	};
}

test('a venue account can create its own profile without supplying an owner ID', async (t) => {
	const originalQuery = db.query;
	let insertParameters;
	const createdProfile = {
		id: 31,
		userId: 1536,
		venueName: 'The Blue Note',
		location: 'Nairobi',
		capacity: 250,
		supportedGenres: 'Jazz, R&B',
		description: 'An intimate live music venue.',
	};
	db.query = async (sql, parameters = []) => {
		if (sql.includes('INSERT INTO venue_profiles')) {
			insertParameters = parameters;
			return [{ insertId: createdProfile.id }, []];
		}
		if (sql.includes('FROM venue_profiles') && sql.includes('WHERE id = ?')) {
			return [[createdProfile], []];
		}
		throw new Error('Unexpected venue query');
	};
	t.after(() => {
		db.query = originalQuery;
	});

	const baseUrl = await listen(t, createApp({ apiKeys }));
	const token = userAuth.issueUserToken({ id: 1536, role: 'venue' });
	const response = await fetch(`${baseUrl}/api/venues`, {
		method: 'POST',
		headers: {
			Origin: 'http://localhost:5173',
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(venueProfile({ userId: 9999 })),
	});

	assert.equal(response.status, 201);
	assert.deepEqual(await response.json(), createdProfile);
	assert.deepEqual(insertParameters, [
		1536,
		'The Blue Note',
		'Nairobi',
		250,
		'Jazz, R&B',
		'An intimate live music venue.',
	]);
});

test('a venue account can create multiple profiles under the same owner', async (t) => {
	const originalQuery = db.query;
	const createdProfiles = [];
	db.query = async (sql, parameters) => {
		if (sql.includes('INSERT INTO venue_profiles')) {
			const profile = {
				id: createdProfiles.length + 1,
				userId: parameters[0],
				venueName: parameters[1],
				location: parameters[2],
				capacity: parameters[3],
				supportedGenres: parameters[4],
				description: parameters[5],
			};
			createdProfiles.push(profile);
			return [{ insertId: profile.id }, []];
		}
		if (sql.includes('FROM venue_profiles') && sql.includes('WHERE id = ?')) {
			return [[createdProfiles.find((profile) => profile.id === Number(parameters[0]))], []];
		}
		throw new Error('Unexpected venue query');
	};
	t.after(() => {
		db.query = originalQuery;
	});

	const baseUrl = await listen(t, createApp({ apiKeys }));
	const token = userAuth.issueUserToken({ id: 1536, role: 'venue' });
	for (const profile of [
		venueProfile(),
		venueProfile({ venueName: 'The Green Room', location: 'Mombasa', capacity: 120 }),
	]) {
		const response = await fetch(`${baseUrl}/api/venues`, {
			method: 'POST',
			headers: {
				Origin: 'http://localhost:5173',
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(profile),
		});
		assert.equal(response.status, 201);
	}

	assert.equal(createdProfiles.length, 2);
	assert.deepEqual(createdProfiles.map(({ userId }) => userId), [1536, 1536]);
});

test('venue creation explains when the database still enforces one profile per account', async (t) => {
	const originalQuery = db.query;
	db.query = async (sql) => {
		if (sql.includes('INSERT INTO venue_profiles')) {
			const error = new Error('Duplicate entry');
			error.code = 'ER_DUP_ENTRY';
			throw error;
		}
		throw new Error('Unexpected venue query');
	};
	t.after(() => {
		db.query = originalQuery;
	});

	const baseUrl = await listen(t, createApp({ apiKeys }));
	const token = userAuth.issueUserToken({ id: 1536, role: 'venue' });
	const response = await fetch(`${baseUrl}/api/venues`, {
		method: 'POST',
		headers: {
			Origin: 'http://localhost:5173',
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(venueProfile({ venueName: 'The Green Room' })),
	});

	assert.equal(response.status, 409);
	assert.match((await response.json()).error, /multiple venue profiles migration/);
});

test('venue profile creation validates required fields and capacity before database writes', async (t) => {
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
	const token = userAuth.issueUserToken({ id: 1536, role: 'venue' });
	for (const [invalidBody, expectedError] of [
		[venueProfile({ venueName: '' }), 'venueName is required.'],
		[venueProfile({ location: 'x'.repeat(256) }), 'location must be 255 characters or fewer.'],
		[venueProfile({ location: 'London' }), 'location must be one of the supported Kenyan counties.'],
		[venueProfile({ capacity: -1 }), 'capacity must be a non-negative integer.'],
		[venueProfile({ capacity: 2.5 }), 'capacity must be a non-negative integer.'],
	]) {
		const response = await fetch(`${baseUrl}/api/venues`, {
			method: 'POST',
			headers: {
				Origin: 'http://localhost:5173',
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(invalidBody),
		});
		assert.equal(response.status, 400);
		assert.deepEqual(await response.json(), { error: expectedError });
	}
	assert.equal(queryCount, 0, 'invalid venue profiles must not reach MySQL');
});

test('artist accounts cannot create venue profiles', async (t) => {
	const originalQuery = db.query;
	db.query = async () => {
		throw new Error('Venue inserts must not be reached by an artist.');
	};
	t.after(() => {
		db.query = originalQuery;
	});

	const baseUrl = await listen(t, createApp({ apiKeys }));
	const token = userAuth.issueUserToken({ id: 1536, role: 'artist' });
	const response = await fetch(`${baseUrl}/api/venues`, {
		method: 'POST',
		headers: {
			Origin: 'http://localhost:5173',
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(venueProfile()),
	});

	assert.equal(response.status, 403);
	assert.deepEqual(await response.json(), { error: 'Forbidden.' });
});
