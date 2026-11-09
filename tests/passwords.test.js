const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, isPasswordHash, verifyPassword } = require('../lib/passwords');

test('new password hashes verify without exposing the original value', async () => {
	const password = 'example-test-password';
	const hash = await hashPassword(password);

	assert.notEqual(hash, password);
	assert.match(hash, /^scrypt\$16384\$8\$1\$/);
	assert.equal(isPasswordHash(hash), true);
	assert.deepEqual(await verifyPassword(password, hash), {
		valid: true,
		needsUpgrade: false,
	});
	assert.equal((await verifyPassword('wrong-password', hash)).valid, false);
});

test('password-hash detection does not accept malformed encodings', () => {
	assert.equal(isPasswordHash('scrypt$invalid'), false);
	assert.equal(isPasswordHash('plain-password'), false);
});

test('legacy plaintext passwords can be upgraded after successful login', async () => {
	assert.deepEqual(await verifyPassword('legacy-test-password', 'legacy-test-password'), {
		valid: true,
		needsUpgrade: true,
	});
	assert.deepEqual(await verifyPassword('wrong-password', 'legacy-test-password'), {
		valid: false,
		needsUpgrade: true,
	});
});
