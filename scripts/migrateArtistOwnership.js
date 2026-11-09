const OWNER_COLUMN = 'owner_user_id';
const OWNER_INDEX = 'idx_artists_owner_user_id';
const OWNER_CONSTRAINT = 'fk_artists_owner_user';

async function migrateArtistOwnership(connection) {
	if (!connection || typeof connection.query !== 'function') {
		throw new TypeError('A promise-based database connection is required.');
	}

	const [columns] = await connection.query(
		`SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
		 FROM INFORMATION_SCHEMA.COLUMNS
		 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
		['artists', OWNER_COLUMN],
	);
	let columnAdded = false;
	if (columns.length === 0) {
		await connection.query('ALTER TABLE artists ADD COLUMN owner_user_id INT NULL');
		columnAdded = true;
	} else if (
		columns[0].DATA_TYPE !== 'int' ||
		columns[0].IS_NULLABLE !== 'YES'
	) {
		throw new Error('artists.owner_user_id exists with an incompatible definition.');
	}

	const [indexes] = await connection.query(
		`SELECT COLUMN_NAME, SEQ_IN_INDEX, NON_UNIQUE
		 FROM INFORMATION_SCHEMA.STATISTICS
		 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
		['artists', OWNER_INDEX],
	);
	let indexAdded = false;
	if (indexes.length === 0) {
		await connection.query('CREATE INDEX idx_artists_owner_user_id ON artists (owner_user_id)');
		indexAdded = true;
	} else if (
		indexes.length !== 1 ||
		indexes[0].COLUMN_NAME !== OWNER_COLUMN ||
		indexes[0].SEQ_IN_INDEX !== 1 ||
		indexes[0].NON_UNIQUE !== 1
	) {
		throw new Error('The artist-owner index exists with an incompatible definition.');
	}

	const [constraints] = await connection.query(
		`SELECT KCU.REFERENCED_TABLE_NAME, KCU.REFERENCED_COLUMN_NAME,
		        RC.DELETE_RULE, RC.UPDATE_RULE
		 FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE KCU
		 JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS RC
		   ON RC.CONSTRAINT_SCHEMA = KCU.CONSTRAINT_SCHEMA
		  AND RC.CONSTRAINT_NAME = KCU.CONSTRAINT_NAME
		 WHERE KCU.TABLE_SCHEMA = DATABASE() AND KCU.TABLE_NAME = ? AND KCU.CONSTRAINT_NAME = ?
		   AND KCU.COLUMN_NAME = ?`,
		['artists', OWNER_CONSTRAINT, OWNER_COLUMN],
	);
	let foreignKeyAdded = false;
	if (constraints.length === 0) {
		await connection.query(
			'ALTER TABLE artists ADD CONSTRAINT fk_artists_owner_user ' +
			'FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE',
		);
		foreignKeyAdded = true;
	} else if (
		constraints[0].REFERENCED_TABLE_NAME !== 'users' ||
		constraints[0].REFERENCED_COLUMN_NAME !== 'id' ||
		constraints[0].DELETE_RULE !== 'SET NULL' ||
		constraints[0].UPDATE_RULE !== 'CASCADE'
	) {
		throw new Error('The artist-owner foreign key exists with an incompatible definition.');
	}

	return { columnAdded, indexAdded, foreignKeyAdded };
}

if (require.main === module) {
	const db = require('../db');
	migrateArtistOwnership(db)
		.then((result) => {
			console.log(
				`Artist ownership schema ready (column added: ${result.columnAdded}, ` +
				`index added: ${result.indexAdded}, foreign key added: ${result.foreignKeyAdded}).`,
			);
		})
		.catch((error) => {
			const code = error && (error.code || error.name);
			console.error(`Artist ownership migration failed: ${typeof code === 'string' ? code : 'unknown error'}`);
			process.exitCode = 1;
		})
		.finally(() => db.end());
}

module.exports = { migrateArtistOwnership };
