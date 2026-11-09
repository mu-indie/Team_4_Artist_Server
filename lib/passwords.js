const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

function isPasswordHash(value) {
	return typeof value === 'string' &&
		/^scrypt\$16384\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/i.test(value);
}

async function hashPassword(password) {
	const salt = crypto.randomBytes(16);
	const derivedKey = await scrypt(password, salt, KEY_LENGTH, {
		N: SCRYPT_N,
		r: SCRYPT_R,
		p: SCRYPT_P,
		maxmem: 64 * 1024 * 1024,
	});

	return [
		'scrypt',
		SCRYPT_N,
		SCRYPT_R,
		SCRYPT_P,
		salt.toString('hex'),
		derivedKey.toString('hex'),
	].join('$');
}

async function verifyPassword(password, storedValue) {
	if (typeof password !== 'string' || typeof storedValue !== 'string') {
		return { valid: false, needsUpgrade: false };
	}

	const parts = storedValue.split('$');
	if (parts.length === 6 && parts[0] === 'scrypt') {
		const [, n, r, p, saltHex, hashHex] = parts;
		const parameters = [Number(n), Number(r), Number(p)];
		if (
			!parameters.every(Number.isSafeInteger) ||
			parameters[0] !== SCRYPT_N ||
			parameters[1] !== SCRYPT_R ||
			parameters[2] !== SCRYPT_P ||
			!/^[a-f0-9]{32}$/i.test(saltHex) ||
			!/^[a-f0-9]{128}$/i.test(hashHex)
		) {
			return { valid: false, needsUpgrade: false };
		}

		const expected = Buffer.from(hashHex, 'hex');
		const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH, {
			N: SCRYPT_N,
			r: SCRYPT_R,
			p: SCRYPT_P,
			maxmem: 64 * 1024 * 1024,
		});
		return { valid: crypto.timingSafeEqual(actual, expected), needsUpgrade: false };
	}
	if (storedValue.startsWith('scrypt$')) {
		return { valid: false, needsUpgrade: false };
	}

	const provided = Buffer.from(password);
	const legacy = Buffer.from(storedValue);
	const comparable = provided.length === legacy.length ? provided : Buffer.alloc(legacy.length);
	return {
		valid: crypto.timingSafeEqual(comparable, legacy) && provided.length === legacy.length,
		needsUpgrade: true,
	};
}

module.exports = { hashPassword, isPasswordHash, verifyPassword };
