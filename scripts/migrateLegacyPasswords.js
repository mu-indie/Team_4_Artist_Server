require('dotenv').config({ quiet: true });

const db = require('../db');
const { hashPassword, isPasswordHash } = require('../lib/passwords');

async function migrateLegacyPasswords() {
	const connection = await db.getConnection();
	let migratedCount = 0;

	try {
		await connection.beginTransaction();
		const [users] = await connection.query('SELECT id, password FROM users');
		for (const user of users) {
			if (isPasswordHash(user.password)) continue;

			const hash = await hashPassword(user.password);
			const [result] = await connection.query(
				'UPDATE users SET password = ? WHERE id = ? AND password = ?',
				[hash, user.id, user.password],
			);
			if (result.affectedRows !== 1) {
				throw new Error('A user password changed during migration; no partial update was committed.');
			}
			migratedCount += 1;
		}
		await connection.commit();
		return migratedCount;
	} catch (error) {
		await connection.rollback();
		throw error;
	} finally {
		connection.release();
	}
}

if (require.main === module) {
	migrateLegacyPasswords()
		.then((count) => {
			console.log(`Migrated ${count} legacy password(s).`);
			return db.end();
		})
		.catch(async (error) => {
			const code = error && (error.code || error.name);
			console.error(`Password migration failed: ${typeof code === 'string' ? code : 'unknown error'}`);
			await db.end();
			process.exitCode = 1;
		});
}

module.exports = { migrateLegacyPasswords };
