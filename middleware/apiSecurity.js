const crypto = require('node:crypto');

const API_KEY_PATTERN = /^[a-f0-9]{64}$/i;

function readApiKeys(env = process.env) {
	const keyEntries = [
		{ consumerId: 'development', envName: 'API_KEY_DEVELOPMENT', value: env.API_KEY_DEVELOPMENT },
		{ consumerId: 'ring-partner', envName: 'API_KEY_PARTNER', value: env.API_KEY_PARTNER },
	];
	const invalidNames = keyEntries
		.filter(({ value }) => !API_KEY_PATTERN.test(value || ''))
		.map(({ envName }) => envName);

	if (invalidNames.length) {
		throw new Error(
			`Missing or invalid API key configuration: ${invalidNames.join(', ')}. ` +
			'Set each to a unique 64-character hexadecimal key.',
		);
	}

	if (keyEntries[0].value === keyEntries[1].value) {
		throw new Error('API_KEY_DEVELOPMENT and API_KEY_PARTNER must be different.');
	}

	return keyEntries.map(({ consumerId, value }) => ({ consumerId, value }));
}

function compareKeys(providedKey, configuredKeys) {
	if (typeof providedKey !== 'string') return undefined;
	const provided = Buffer.from(providedKey);
	let matchedConsumer;

	for (const { consumerId, value } of configuredKeys) {
		const expected = Buffer.from(value);
		const comparable = provided.length === expected.length
			? provided
			: Buffer.alloc(expected.length);
		const matched = crypto.timingSafeEqual(comparable, expected) && provided.length === expected.length;
		if (matched) matchedConsumer = consumerId;
	}

	return matchedConsumer;
}

function createRateLimiter({ maxRequests = 100, windowMs = 60_000, now = Date.now } = {}) {
	if (!Number.isSafeInteger(maxRequests) || maxRequests < 1) {
		throw new Error('Rate-limit maximum must be a positive integer.');
	}
	if (!Number.isSafeInteger(windowMs) || windowMs < 1) {
		throw new Error('Rate-limit window must be a positive integer in milliseconds.');
	}

	const windows = new Map();

	return function rateLimit(req, res, next) {
		if (!req.consumerId) return next();

		const currentTime = now();
		let window = windows.get(req.consumerId);
		if (!window || currentTime >= window.startedAt + windowMs) {
			window = { startedAt: currentTime, count: 0 };
			windows.set(req.consumerId, window);
		}

		if (window.count >= maxRequests) {
			const retryAfter = Math.max(1, Math.ceil((window.startedAt + windowMs - currentTime) / 1000));
			res.set('Retry-After', String(retryAfter));
			return res.status(429).json({ message: 'Too many requests', retryAfter });
		}

		window.count += 1;
		return next();
	};
}

function createApiSecurity({
	apiKeys,
	browserOrigins = new Set(),
	maxRequests = 100,
	windowMs = 60_000,
	now,
} = {}) {
	if (!Array.isArray(apiKeys) || apiKeys.length === 0) {
		throw new Error('At least one API key must be configured.');
	}
	const configuredKeys = apiKeys.map(({ consumerId, value }) => ({ consumerId, value }));
	if (configuredKeys.some(({ consumerId, value }) => !consumerId || !API_KEY_PATTERN.test(value || ''))) {
		throw new Error('API keys must have a consumer identifier and be 64-character hexadecimal values.');
	}
	if (
		new Set(configuredKeys.map(({ consumerId }) => consumerId)).size !== configuredKeys.length ||
		new Set(configuredKeys.map(({ value }) => value)).size !== configuredKeys.length
	) {
		throw new Error('API keys and consumer identifiers must be unique.');
	}

	function authenticate(req, res, next) {
		if (req.method === 'GET' && req.path === '/api/health') return next();

		const origin = req.get('Origin');
		if (origin && browserOrigins.has(origin) && req.path !== '/stats') {
			req.browserClient = true;
			req.consumerId = `browser:${req.ip}`;
			return next();
		}

		const consumerId = compareKeys(req.get('X-API-Key'), configuredKeys);
		if (!consumerId) {
			return res.status(401).json({ message: 'Missing or invalid API key' });
		}

		req.consumerId = consumerId;
		return next();
	}

	return {
		authenticate,
		rateLimit: createRateLimiter({ maxRequests, windowMs, now }),
	};
}

function readRateLimitConfig(env = process.env) {
	const maxRequests = env.RATE_LIMIT_MAX_REQUESTS === undefined
		? 100
		: Number(env.RATE_LIMIT_MAX_REQUESTS);
	const windowMs = env.RATE_LIMIT_WINDOW_MS === undefined
		? 60_000
		: Number(env.RATE_LIMIT_WINDOW_MS);

	if (!Number.isSafeInteger(maxRequests) || maxRequests < 1) {
		throw new Error('RATE_LIMIT_MAX_REQUESTS must be a positive integer.');
	}
	if (!Number.isSafeInteger(windowMs) || windowMs < 1) {
		throw new Error('RATE_LIMIT_WINDOW_MS must be a positive integer.');
	}

	return { maxRequests, windowMs };
}

module.exports = { createApiSecurity, readApiKeys, readRateLimitConfig };
