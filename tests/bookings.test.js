const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST ||= '127.0.0.1';
process.env.DB_USER ||= 'test';
process.env.DB_NAME ||= 'test';
process.env.USER_TOKEN_SECRET ||= 'c'.repeat(64);

const { createApp } = require('../index');
const db = require('../db');
const userAuth = require('../middleware/userAuth');

const apiKeys = [
	{ consumerId: 'development', value: 'a'.repeat(64) },
	{ consumerId: 'ring-partner', value: 'b'.repeat(64) },
];

async function listen(t) {
	const server = await new Promise((resolve, reject) => {
		const instance = createApp({ apiKeys }).listen(0, '127.0.0.1', () => resolve(instance));
		instance.once('error', reject);
	});
	t.after(() => new Promise((resolve) => server.close(resolve)));
	return `http://127.0.0.1:${server.address().port}`;
}

function token(id, role) {
	return userAuth.issueUserToken({ id, role });
}

test('new bookings always start pending', async (t) => {
	const originalQuery = db.query;
	let insertValues;
	db.query = async (sql, values) => {
		if (sql.startsWith('INSERT INTO bookings')) {
			insertValues = values;
			return [{ insertId: 12 }, []];
		}
		if (/FROM bookings\s+WHERE id = \?/.test(sql)) {
			return [[{
				id: 12,
				artistId: 7,
				venueId: 3,
				createdByUserId: 7,
				eventDate: '2026-11-01',
				offeredFee: '500.00',
				status: 'Pending',
				notes: null,
				createdAt: '2026-10-27T00:00:00.000Z',
			}], []];
		}
		throw new Error('Unexpected database query');
	};
	t.after(() => {
		db.query = originalQuery;
	});

	const baseUrl = await listen(t);
	const tokenValue = token(7, 'artist');
	const rejectedOverride = await fetch(`${baseUrl}/api/bookings`, {
		method: 'POST',
		headers: {
			'X-API-Key': apiKeys[0].value,
			Authorization: `Bearer ${tokenValue}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ artistId: 7, venueId: 3, status: 'Confirmed' }),
	});
	assert.equal(rejectedOverride.status, 400);
	assert.equal(insertValues, undefined);

	const created = await fetch(`${baseUrl}/api/bookings`, {
		method: 'POST',
		headers: {
			'X-API-Key': apiKeys[0].value,
			Authorization: `Bearer ${tokenValue}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ artistId: 7, venueId: 3 }),
	});
	assert.equal(created.status, 201);
	assert.equal(insertValues[5], 'Pending');
	assert.equal((await created.json()).status, 'Pending');
});

test('a venue can request an artist booking and delete it', async (t) => {
	const originalQuery = db.query;
	const records = new Map();
	let nextId = 40;
	db.query = async (sql, values = []) => {
		if (sql.startsWith('INSERT INTO bookings')) {
			const id = nextId++;
			const booking = {
				id,
				artistId: values[0],
				venueId: values[1],
				createdByUserId: values[2],
				eventDate: values[3],
				offeredFee: values[4],
				status: values[5],
				notes: values[6],
			};
			records.set(id, booking);
			return [{ insertId: id }, []];
		}
		if (sql.startsWith('DELETE FROM bookings')) {
			const existed = records.delete(Number(values[0]));
			return [{ affectedRows: existed ? 1 : 0 }, []];
		}
		if (/FROM bookings\s+WHERE id = \?/.test(sql)) {
			const booking = records.get(Number(values[0]));
			return [[booking ? { ...booking } : undefined].filter(Boolean), []];
		}
		if (sql.startsWith('UPDATE bookings')) {
			const booking = records.get(Number(values[4]));
			booking.status = values[2];
			return [{ affectedRows: 1 }, []];
		}
		throw new Error('Unexpected database query');
	};
	t.after(() => {
		db.query = originalQuery;
	});

	const baseUrl = await listen(t);
	const venueToken = token(3, 'venue');
	const artistToken = token(7, 'artist');
	const requestResponse = await fetch(`${baseUrl}/api/bookings`, {
		method: 'POST',
		headers: {
			'X-API-Key': apiKeys[0].value,
			Authorization: `Bearer ${venueToken}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			artistId: 7,
			venueId: 3,
			eventDate: '2026-12-10',
			offeredFee: 650,
			notes: 'Please perform a one-hour set.',
		}),
	});
	assert.equal(requestResponse.status, 201);
	const request = await requestResponse.json();
	assert.equal(request.status, 'Pending');
	assert.equal(request.createdByUserId, 3);

	const acceptResponse = await fetch(`${baseUrl}/api/bookings/${request.id}`, {
		method: 'PUT',
		headers: {
			'X-API-Key': apiKeys[0].value,
			Authorization: `Bearer ${artistToken}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ artistId: 7, status: 'Accepted' }),
	});
	assert.equal(acceptResponse.status, 200);
	assert.equal((await acceptResponse.json()).status, 'Accepted');

	const secondBooking = { ...request, id: 41, status: 'Pending' };
	records.set(secondBooking.id, secondBooking);
	assert.equal(records.has(41), true);
	const declineResponse = await fetch(`${baseUrl}/api/bookings/${secondBooking.id}`, {
		method: 'DELETE',
		headers: {
			'X-API-Key': apiKeys[0].value,
			Authorization: `Bearer ${artistToken}`,
		},
	});
	assert.equal(declineResponse.status, 204, await declineResponse.text());
	assert.equal(records.has(secondBooking.id), false);
});

test('a declined booking stays visible to the venue until the venue deletes it', async (t) => {
	const originalQuery = db.query;
	const booking = {
		id: 52,
		artistId: 7,
		venueId: 3,
		createdByUserId: 3,
		eventDate: '2026-12-10',
		offeredFee: '650.00',
		status: 'Pending',
		notes: 'Please perform a one-hour set.',
	};
	db.query = async (sql, values = []) => {
		if (sql.startsWith('UPDATE bookings')) {
			booking.status = values[2];
			return [{ affectedRows: 1 }, []];
		}
		if (sql.startsWith('DELETE FROM bookings')) return [{ affectedRows: 1 }, []];
		if (/FROM bookings\s+WHERE id = \?/.test(sql)) {
			return [[{ ...booking }], []];
		}
		throw new Error('Unexpected database query');
	};
	t.after(() => {
		db.query = originalQuery;
	});

	const baseUrl = await listen(t);
	const artistToken = token(7, 'artist');
	const venueToken = token(3, 'venue');
	const declineResponse = await fetch(`${baseUrl}/api/bookings/52`, {
		method: 'PUT',
		headers: {
			'X-API-Key': apiKeys[0].value,
			Authorization: `Bearer ${artistToken}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ artistId: 7, status: 'Rejected' }),
	});
	assert.equal(declineResponse.status, 200);
	assert.equal((await declineResponse.json()).status, 'Rejected');

	const venueBookingResponse = await fetch(`${baseUrl}/api/bookings/52`, {
		headers: {
			'X-API-Key': apiKeys[0].value,
			Authorization: `Bearer ${venueToken}`,
		},
	});
	assert.equal(venueBookingResponse.status, 200);
	assert.equal((await venueBookingResponse.json()).status, 'Rejected');

	const deleteResponse = await fetch(`${baseUrl}/api/bookings/52`, {
		method: 'DELETE',
		headers: {
			'X-API-Key': apiKeys[0].value,
			Authorization: `Bearer ${venueToken}`,
		},
	});
	assert.equal(deleteResponse.status, 204);
});

test('booking status transitions are role-checked and terminal states cannot reopen', async (t) => {
	const originalQuery = db.query;
	let booking = {
		id: 12,
		artistId: 7,
		venueId: 3,
		createdByUserId: 7,
		eventDate: '2026-11-01',
		offeredFee: '500.00',
		status: 'Pending',
		notes: null,
		createdAt: '2026-10-27T00:00:00.000Z',
	};
	let updates = 0;
	db.query = async (sql, values) => {
		if (/FROM bookings\s+WHERE id = \?/.test(sql)) return [[{ ...booking }], []];
		if (sql.startsWith('UPDATE bookings')) {
			updates += 1;
			booking = { ...booking, status: values[2] };
			return [{ affectedRows: 1 }, []];
		}
		throw new Error('Unexpected database query');
	};
	t.after(() => {
		db.query = originalQuery;
	});

	const baseUrl = await listen(t);
	const venueToken = token(3, 'venue');
	const artistToken = token(7, 'artist');

	const creatorCannotAccept = await fetch(`${baseUrl}/api/bookings/12`, {
		method: 'PUT',
		headers: {
			'X-API-Key': apiKeys[0].value,
			Authorization: `Bearer ${artistToken}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ artistId: 7, status: 'Confirmed' }),
	});
	assert.equal(creatorCannotAccept.status, 403);

	const inviteeAccepts = await fetch(`${baseUrl}/api/bookings/12`, {
		method: 'PUT',
		headers: {
			'X-API-Key': apiKeys[0].value,
			Authorization: `Bearer ${venueToken}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ venueId: 3, status: 'Confirmed' }),
	});
	assert.equal(inviteeAccepts.status, 200);
	assert.equal((await inviteeAccepts.json()).status, 'Confirmed');

	const participantTransfer = await fetch(`${baseUrl}/api/bookings/12`, {
		method: 'PUT',
		headers: {
			'X-API-Key': apiKeys[0].value,
			Authorization: `Bearer ${venueToken}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ venueId: 3, artistId: 8 }),
	});
	assert.equal(participantTransfer.status, 403);

	booking = { ...booking, createdByUserId: null, status: 'Pending' };
	const legacyBookingDecision = await fetch(`${baseUrl}/api/bookings/12`, {
		method: 'PUT',
		headers: {
			'X-API-Key': apiKeys[0].value,
			Authorization: `Bearer ${venueToken}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ venueId: 3, status: 'Confirmed' }),
	});
	assert.equal(legacyBookingDecision.status, 409);

	booking = { ...booking, createdByUserId: 7 };
	const artistCancels = await fetch(`${baseUrl}/api/bookings/12`, {
		method: 'PUT',
		headers: {
			'X-API-Key': apiKeys[0].value,
			Authorization: `Bearer ${artistToken}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ artistId: 7, status: 'Cancelled' }),
	});
	assert.equal(artistCancels.status, 200);
	assert.equal((await artistCancels.json()).status, 'Cancelled');

	const cannotReopen = await fetch(`${baseUrl}/api/bookings/12`, {
		method: 'PUT',
		headers: {
			'X-API-Key': apiKeys[0].value,
			Authorization: `Bearer ${venueToken}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ venueId: 3, status: 'Confirmed' }),
	});
	assert.equal(cannotReopen.status, 409);
	assert.equal(updates, 2);
});
