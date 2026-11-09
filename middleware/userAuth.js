const crypto = require('node:crypto');

const TOKEN_TTL_SECONDS = 60 * 60;
const ROLES = new Set(['artist', 'venue']);
const SECRET_PATTERN = /^[a-f0-9]{64}$/i;

function readUserTokenSecret(env = process.env) {
	if (!SECRET_PATTERN.test(env.USER_TOKEN_SECRET || '')) {
		throw new Error('Missing or invalid USER_TOKEN_SECRET. Set it to a 64-character hexadecimal secret.');
	}
	return Buffer.from(env.USER_TOKEN_SECRET, 'hex');
}

function parseUserId(value) {
	if (typeof value !== 'string' && typeof value !== 'number') return undefined;
	const text = String(value);
	if (!/^[1-9][0-9]*$/.test(text)) return undefined;
	const id = Number(text);
	return Number.isSafeInteger(id) ? id : undefined;
}

function createUserAuth({ secret, now = Date.now } = {}) {
	const secretBytes = Buffer.isBuffer(secret) ? secret : Buffer.from(secret || '', 'hex');
	if (secretBytes.length !== 32) {
		throw new Error('User-token signing secret must be 32 bytes.');
	}

	function issueUserToken(user) {
		const userId = parseUserId(user.id);
		if (!userId || !ROLES.has(user.role)) {
			throw new Error('Cannot issue a token for an invalid user.');
		}

		const payload = Buffer.from(JSON.stringify({
			sub: String(userId),
			role: user.role,
			exp: Math.floor(now() / 1000) + TOKEN_TTL_SECONDS,
		})).toString('base64url');
		const signature = crypto.createHmac('sha256', secretBytes).update(payload).digest('base64url');
		return `${payload}.${signature}`;
	}

	function verifyUserToken(token) {
		if (typeof token !== 'string') return undefined;
		const parts = token.split('.');
		if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined;

		const expectedSignature = crypto.createHmac('sha256', secretBytes)
			.update(parts[0])
			.digest();
		let providedSignature;
		try {
			providedSignature = Buffer.from(parts[1], 'base64url');
		} catch {
			return undefined;
		}
		if (
			providedSignature.length !== expectedSignature.length ||
			!crypto.timingSafeEqual(providedSignature, expectedSignature)
		) {
			return undefined;
		}

		let payload;
		try {
			payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
		} catch {
			return undefined;
		}
		const id = parseUserId(payload.sub);
		if (
			!id ||
			!ROLES.has(payload.role) ||
			!Number.isSafeInteger(payload.exp) ||
			payload.exp <= Math.floor(now() / 1000)
		) {
			return undefined;
		}

		return { id, role: payload.role };
	}

	function requireUser(req, res, next) {
		const match = /^Bearer ([^\s]+)$/.exec(req.get('Authorization') || '');
		const user = match ? verifyUserToken(match[1]) : undefined;
		if (!user) {
			return res.status(401).json({ message: 'Missing or invalid user access token' });
		}
		req.user = user;
		return next();
	}

	function requireOwner(paramName) {
		return function verifyOwner(req, res, next) {
			const requestedId = parseUserId(req.params[paramName]);
			if (!req.user || !requestedId) {
				return res.status(404).json({ error: 'Not found.' });
			}
			if (requestedId !== req.user.id) {
				return res.status(404).json({ error: 'Not found.' });
			}
			return next();
		};
	}

	function requireBodyOwner(fieldName) {
		return function verifyBodyOwner(req, res, next) {
			if (!req.body || req.body[fieldName] === undefined) {
				return res.status(400).json({ error: `${fieldName} is required.` });
			}
			if (parseUserId(req.body[fieldName]) !== req.user?.id) {
				return res.status(403).json({ error: 'You can only modify records you own.' });
			}
			return next();
		};
	}

	function requireRole(...roles) {
		return function verifyRole(req, res, next) {
			if (!req.user) {
				return res.status(401).json({ message: 'Missing or invalid user access token' });
			}
			if (!roles.includes(req.user.role)) {
				return res.status(403).json({ error: 'Forbidden.' });
			}
			return next();
		};
	}

	return { issueUserToken, verifyUserToken, requireUser, requireOwner, requireBodyOwner, requireRole };
}

const configuredAuth = createUserAuth({ secret: readUserTokenSecret() });

module.exports = {
	TOKEN_TTL_SECONDS,
	createUserAuth,
	parseUserId,
	readUserTokenSecret,
	...configuredAuth,
};
