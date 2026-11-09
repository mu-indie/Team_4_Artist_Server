const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateMultipleVenueProfiles } = require('../scripts/migrateMultipleVenueProfiles');

function createDatabase(initialIndexes = []) {
	const indexes = new Map(initialIndexes.map(([name, columns]) => [name, columns]));
	const statements = [];
	return {
		indexes,
		statements,
		async query(sql) {
			statements.push(sql.replace(/\s+/g, ' ').trim());
			if (sql.includes('INFORMATION_SCHEMA.STATISTICS')) {
				return [[...indexes.entries()].flatMap(([name, columns]) => columns.map((column, position) => ({
					INDEX_NAME: name,
					COLUMN_NAME: column.name,
					SEQ_IN_INDEX: position + 1,
					NON_UNIQUE: column.nonUnique,
				}))), []];
			}
			if (sql.startsWith('CREATE INDEX')) {
				indexes.set('idx_venue_profiles_user_id', [{ name: 'user_id', nonUnique: 1 }]);
			} else if (sql.startsWith('ALTER TABLE venue_profiles DROP INDEX')) {
				const name = sql.match(/DROP INDEX `([^`]+)`/)?.[1];
				indexes.delete(name);
			}
			return [{ affectedRows: 0 }, []];
		},
	};
}

test('multiple-venue migration replaces the unique owner index idempotently', async () => {
	const db = createDatabase([
		['user_id', [{ name: 'user_id', nonUnique: 0 }]],
	]);

	assert.deepEqual(await migrateMultipleVenueProfiles(db), {
		supportingIndexAdded: true,
		uniqueIndexesRemoved: ['user_id'],
	});
	assert.equal(db.indexes.has('user_id'), false);
	assert.deepEqual(db.indexes.get('idx_venue_profiles_user_id'), [
		{ name: 'user_id', nonUnique: 1 },
	]);

	assert.deepEqual(await migrateMultipleVenueProfiles(db), {
		supportingIndexAdded: false,
		uniqueIndexesRemoved: [],
	});
});

test('multiple-venue migration refuses to remove an unexpected composite unique index', async () => {
	const db = createDatabase([
		['unique_owner_name', [
			{ name: 'user_id', nonUnique: 0 },
			{ name: 'venue_name', nonUnique: 0 },
		]],
	]);

	await assert.rejects(
		migrateMultipleVenueProfiles(db),
		/unexpected composite unique index/,
	);
	assert.equal(db.indexes.has('unique_owner_name'), true);
	assert.equal(db.indexes.has('idx_venue_profiles_user_id'), true);
});

test('multiple-venue migration requires a promise-based database connection', async () => {
	await assert.rejects(migrateMultipleVenueProfiles(null), /promise-based database connection/);
});
