const VENUE_USER_INDEX = 'idx_venue_profiles_user_id';

async function migrateMultipleVenueProfiles(connection) {
	if (!connection || typeof connection.query !== 'function') {
		throw new TypeError('A promise-based database connection is required.');
	}

	const [indexes] = await connection.query(
		`SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX, NON_UNIQUE
		 FROM INFORMATION_SCHEMA.STATISTICS
		 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
		['venue_profiles'],
	);
	const indexesByName = new Map();
	for (const index of indexes) {
		const columns = indexesByName.get(index.INDEX_NAME) || [];
		columns.push(index);
		indexesByName.set(index.INDEX_NAME, columns);
	}

	const supportingIndex = indexesByName.get(VENUE_USER_INDEX);
	let supportingIndexAdded = false;
	if (!supportingIndex) {
		await connection.query(
			'CREATE INDEX idx_venue_profiles_user_id ON venue_profiles (user_id)',
		);
		supportingIndexAdded = true;
	} else if (
		supportingIndex.length !== 1 ||
		supportingIndex[0].COLUMN_NAME !== 'user_id' ||
		supportingIndex[0].SEQ_IN_INDEX !== 1 ||
		supportingIndex[0].NON_UNIQUE !== 1
	) {
		throw new Error('The venue-owner supporting index exists with an incompatible definition.');
	}

	const uniqueUserIndexes = [...indexesByName.entries()]
		.filter(([name, columns]) => name !== 'PRIMARY' && columns.some(({ COLUMN_NAME }) => COLUMN_NAME === 'user_id'))
		.filter(([, columns]) => columns.some(({ NON_UNIQUE }) => NON_UNIQUE === 0));
	const uniqueIndexesRemoved = [];

	for (const [name, columns] of uniqueUserIndexes) {
		if (columns.length !== 1 || columns[0].COLUMN_NAME !== 'user_id') {
			throw new Error('An unexpected composite unique index involving venue_profiles.user_id requires manual review.');
		}
		await connection.query(`ALTER TABLE venue_profiles DROP INDEX \`${name.replace(/`/g, '``')}\``);
		uniqueIndexesRemoved.push(name);
	}

	return { supportingIndexAdded, uniqueIndexesRemoved };
}

if (require.main === module) {
	const db = require('../db');
	migrateMultipleVenueProfiles(db)
		.then(({ supportingIndexAdded, uniqueIndexesRemoved }) => {
			console.log(
				`Multiple venue profiles enabled (supporting index added: ${supportingIndexAdded}; ` +
				`unique owner indexes removed: ${uniqueIndexesRemoved.length}).`,
			);
		})
		.catch((error) => {
			const code = error && (error.code || error.name);
			console.error(`Multiple venue profile migration failed: ${typeof code === 'string' ? code : 'unknown error'}`);
			process.exitCode = 1;
		})
		.finally(() => db.end());
}

module.exports = { migrateMultipleVenueProfiles };
