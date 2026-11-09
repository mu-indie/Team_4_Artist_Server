const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateBookingStatuses } = require('../scripts/migrateBookingStatuses');

function createDatabase() {
	const statements = [];
	let legacyRows = ['Accepted', 'Rejected'];
	const schema = { creatorColumn: false, creatorIndex: false, creatorForeignKey: false };
	return {
		statements,
		async query(sql) {
			statements.push(sql.replace(/\s+/g, ' ').trim());
			if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
				return [schema.creatorColumn
					? [{ COLUMN_NAME: 'created_by_user_id', DATA_TYPE: 'int', IS_NULLABLE: 'YES' }]
					: [], []];
			}
			if (sql.includes('INFORMATION_SCHEMA.STATISTICS')) {
				return [schema.creatorIndex
					? [{ COLUMN_NAME: 'created_by_user_id', SEQ_IN_INDEX: 1, NON_UNIQUE: 1 }]
					: [], []];
			}
			if (sql.includes('INFORMATION_SCHEMA.KEY_COLUMN_USAGE')) {
				return [schema.creatorForeignKey
					? [{
						REFERENCED_TABLE_NAME: 'users',
						REFERENCED_COLUMN_NAME: 'id',
						DELETE_RULE: 'SET NULL',
						UPDATE_RULE: 'CASCADE',
					}]
					: [], []];
			}
			if (sql.startsWith('UPDATE bookings')) {
				const affectedRows = legacyRows.length;
				legacyRows = [];
				return [{ affectedRows }, []];
			}
			if (sql.startsWith('ALTER TABLE bookings ADD COLUMN')) schema.creatorColumn = true;
			else if (sql.startsWith('CREATE INDEX idx_bookings_created_by_user_id')) schema.creatorIndex = true;
			else if (sql.startsWith('ALTER TABLE bookings ADD CONSTRAINT')) schema.creatorForeignKey = true;
			return [{ affectedRows: 0 }, []];
		},
	};
}

test('booking migration converts legacy status values and adds an idempotent creator relationship', async () => {
	const db = createDatabase();

	assert.deepEqual(await migrateBookingStatuses(db), {
		legacyStatusesMigrated: 2,
		creatorColumnAdded: true,
		creatorIndexAdded: true,
		creatorForeignKeyAdded: true,
	});
	assert.match(db.statements[0], /'Accepted','Rejected','Completed','Confirmed','Declined','Cancelled'/);
	assert.match(db.statements[1], /WHEN 'Accepted' THEN 'Confirmed' WHEN 'Rejected' THEN 'Declined'/);
	assert.match(db.statements.join('\n'), /created_by_user_id INT NULL/);
	assert.match(db.statements.join('\n'), /REFERENCES users \(id\) ON DELETE SET NULL/);
	assert.match(db.statements.at(-1), /'Pending','Confirmed','Declined','Cancelled','Completed'/);

	assert.deepEqual(await migrateBookingStatuses(db), {
		legacyStatusesMigrated: 0,
		creatorColumnAdded: false,
		creatorIndexAdded: false,
		creatorForeignKeyAdded: false,
	});
});

test('booking-status migration requires a promise database connection', async () => {
	await assert.rejects(migrateBookingStatuses(undefined), /promise-based database connection/);
});
