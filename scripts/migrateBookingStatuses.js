async function migrateBookingStatuses(connection) {
	if (!connection || typeof connection.query !== 'function') {
		throw new TypeError('A promise-based database connection is required.');
	}

	await connection.query(
		"ALTER TABLE bookings MODIFY COLUMN status " +
		"ENUM('Pending','Accepted','Rejected','Completed','Confirmed','Declined','Cancelled') " +
		"NOT NULL DEFAULT 'Pending'",
	);
	const [result] = await connection.query(
		"UPDATE bookings SET status = CASE status " +
		"WHEN 'Accepted' THEN 'Confirmed' WHEN 'Rejected' THEN 'Declined' ELSE status END " +
		"WHERE status IN ('Accepted','Rejected')",
	);

	const [columns] = await connection.query(
		`SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
		 FROM INFORMATION_SCHEMA.COLUMNS
		 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
		['bookings', 'created_by_user_id'],
	);
	let creatorColumnAdded = false;
	if (columns.length === 0) {
		await connection.query(
			'ALTER TABLE bookings ADD COLUMN created_by_user_id INT NULL AFTER venue_id',
		);
		creatorColumnAdded = true;
	} else if (columns[0].DATA_TYPE !== 'int' || columns[0].IS_NULLABLE !== 'YES') {
		throw new Error('bookings.created_by_user_id exists with an incompatible definition.');
	}

	const [indexes] = await connection.query(
		`SELECT COLUMN_NAME, SEQ_IN_INDEX, NON_UNIQUE
		 FROM INFORMATION_SCHEMA.STATISTICS
		 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
		['bookings', 'idx_bookings_created_by_user_id'],
	);
	let creatorIndexAdded = false;
	if (indexes.length === 0) {
		await connection.query(
			'CREATE INDEX idx_bookings_created_by_user_id ON bookings (created_by_user_id)',
		);
		creatorIndexAdded = true;
	} else if (
		indexes.length !== 1 ||
		indexes[0].COLUMN_NAME !== 'created_by_user_id' ||
		indexes[0].SEQ_IN_INDEX !== 1 ||
		indexes[0].NON_UNIQUE !== 1
	) {
		throw new Error('The booking-creator index exists with an incompatible definition.');
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
		['bookings', 'fk_bookings_created_by_user', 'created_by_user_id'],
	);
	let creatorForeignKeyAdded = false;
	if (constraints.length === 0) {
		await connection.query(
			'ALTER TABLE bookings ADD CONSTRAINT fk_bookings_created_by_user ' +
			'FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE',
		);
		creatorForeignKeyAdded = true;
	} else if (
		constraints[0].REFERENCED_TABLE_NAME !== 'users' ||
		constraints[0].REFERENCED_COLUMN_NAME !== 'id' ||
		constraints[0].DELETE_RULE !== 'SET NULL' ||
		constraints[0].UPDATE_RULE !== 'CASCADE'
	) {
		throw new Error('The booking-creator foreign key exists with an incompatible definition.');
	}

	await connection.query(
		"ALTER TABLE bookings MODIFY COLUMN status " +
		"ENUM('Pending','Confirmed','Declined','Cancelled','Completed') NOT NULL DEFAULT 'Pending'",
	);

	return {
		legacyStatusesMigrated: result.affectedRows,
		creatorColumnAdded,
		creatorIndexAdded,
		creatorForeignKeyAdded,
	};
}

if (require.main === module) {
	const db = require('../db');
	migrateBookingStatuses(db)
		.then(({ legacyStatusesMigrated, creatorColumnAdded, creatorIndexAdded, creatorForeignKeyAdded }) => {
			console.log(
				`Booking migration complete (${legacyStatusesMigrated} legacy statuses mapped; ` +
				`creator column added: ${creatorColumnAdded}, index added: ${creatorIndexAdded}, ` +
				`foreign key added: ${creatorForeignKeyAdded}).`,
			);
		})
		.catch((error) => {
			const code = error && (error.code || error.name);
			console.error(`Booking status migration failed: ${typeof code === 'string' ? code : 'unknown error'}`);
			process.exitCode = 1;
		})
		.finally(() => db.end());
}

module.exports = { migrateBookingStatuses };
