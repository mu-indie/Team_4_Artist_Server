const { describe, expect, it } = require('@jest/globals');
const { readRateLimitConfig } = require('../middleware/apiSecurity');

describe('rate-limit environment configuration', () => {
	it('uses the documented defaults when rate-limit variables are unset', () => {
		expect(readRateLimitConfig({})).toEqual({
			maxRequests: 100,
			windowMs: 60_000,
		});
	});

	it('reads configured rate-limit values from environment strings', () => {
		expect(readRateLimitConfig({
			RATE_LIMIT_MAX_REQUESTS: '25',
			RATE_LIMIT_WINDOW_MS: '30000',
		})).toEqual({
			maxRequests: 25,
			windowMs: 30_000,
		});
	});

	it('rejects invalid configured limits', () => {
		expect(() => readRateLimitConfig({ RATE_LIMIT_MAX_REQUESTS: '0' }))
			.toThrow('RATE_LIMIT_MAX_REQUESTS must be a positive integer.');
		expect(() => readRateLimitConfig({ RATE_LIMIT_WINDOW_MS: 'not-a-number' }))
			.toThrow('RATE_LIMIT_WINDOW_MS must be a positive integer.');
	});
});
