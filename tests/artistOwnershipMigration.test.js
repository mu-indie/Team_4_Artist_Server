const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateArtistOwnership } = require('../scripts/migrateArtistOwnership');

function createSchemaDatabase() {
	const schema = { column: false, index: false, foreignKey: false };
	const statements = [];
	return {
		schema,
		statements,
		async query(sql, params) {
			statements.push(sql.replace(/\s+/g, ' ').trim());
			if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
				if (!schema.column) return [[], []];
				return [[{ COLUMN_NAME: 'owner_user_id', DATA_TYPE: 'int', IS_NULLABLE: 'YES' }], []];
			}
			if (sql.includes('INFORMATION_SCHEMA.STATISTICS')) {
				return [schema.index
					? [{ COLUMN_NAME: 'owner_user_id', SEQ_IN_INDEX: 1, NON_UNIQUE: 1 }]
					: [], []];
			}
			if (sql.includes('INFORMATION_SCHEMA.KEY_COLUMN_USAGE')) {
				return [schema.foreignKey
					? [{
						REFERENCED_TABLE_NAME: 'users',
						REFERENCED_COLUMN_NAME: 'id',
						DELETE_RULE: 'SET NULL',
						UPDATE_RULE: 'CASCADE',
					}]
					: [], []];
			}
			if (sql.startsWith('ALTER TABLE artists ADD COLUMN')) schema.column = true;
			else if (sql.startsWith('CREATE INDEX')) schema.index = true;
			else if (sql.startsWith('ALTER TABLE artists ADD CONSTRAINT')) schema.foreignKey = true;
			return [{ affectedRows: 0 }, []];
		},
	};
}

test('artist-owner migration adds nullable relationship objects and is idempotent', async () => {
	const db = createSchemaDatabase();

	assert.deepEqual(await migrateArtistOwnership(db), {
		columnAdded: true,
		indexAdded: true,
		foreignKeyAdded: true,
	});
	assert.match(db.statements.join('\n'), /owner_user_id INT NULL/);
	assert.match(db.statements.join('\n'), /REFERENCES users \(id\) ON DELETE SET NULL/);

	const statementCount = db.statements.length;
	assert.deepEqual(await migrateArtistOwnership(db), {
		columnAdded: false,
		indexAdded: false,
		foreignKeyAdded: false,
	});
	assert.equal(db.statements.length, statementCount + 3);
});

test('artist-owner migration rejects an incompatible existing column', async () => {
	const db = createSchemaDatabase();
	db.schema.column = true;
	db.query = async (sql) => {
		if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) {
			return [[{ COLUMN_NAME: 'owner_user_id', DATA_TYPE: 'varchar', IS_NULLABLE: 'YES' }], []];
		}
		throw new Error('Unexpected migration statement');
	};

	await assert.rejects(migrateArtistOwnership(db), /incompatible definition/);
});
