require('dotenv').config({ quiet: true });

const express = require('express');
const cors = require('cors');
const { createApiSecurity, readApiKeys, readRateLimitConfig } = require('./middleware/apiSecurity');
const { monitor, statsHandler } = require('./monitoring');

const LOCAL_FRONTEND_ORIGIN = 'http://localhost:5173';

function readAllowedFrontendOrigins() {
	const origins = new Set([LOCAL_FRONTEND_ORIGIN]);
	const configuredOrigin = process.env.FRONTEND_ORIGIN?.trim();
	if (!configuredOrigin) return origins;

	let parsedOrigin;
	try {
		parsedOrigin = new URL(configuredOrigin);
	} catch {
		throw new Error('FRONTEND_ORIGIN must be an exact HTTP(S) origin, such as https://your-frontend.example.');
	}

	if (
		!['http:', 'https:'].includes(parsedOrigin.protocol) ||
		parsedOrigin.origin !== configuredOrigin
	) {
		throw new Error('FRONTEND_ORIGIN must be an exact HTTP(S) origin without a path or trailing slash.');
	}

	origins.add(configuredOrigin);
	return origins;
}

function createApp(options = {}) {
	const apiKeys = options.apiKeys || readApiKeys();
	const rateLimit = options.rateLimit || readRateLimitConfig();
	const frontendApiKey = apiKeys.find(({ consumerId }) => consumerId === 'development')?.value;
	if (!frontendApiKey) {
		throw new Error('A development API key is required for the frontend API proxy.');
	}
	const userAuth = require('./middleware/userAuth');
	const db = require('./db');
	const app = express();
	app.use(monitor);
	const allowedFrontendOrigins = readAllowedFrontendOrigins();
	app.set('trust proxy', 1);
	const security = createApiSecurity({
		apiKeys,
		browserOrigins: allowedFrontendOrigins,
		maxRequests: rateLimit.maxRequests,
		windowMs: rateLimit.windowMs,
		now: options.now,
	});

	app.use(cors({
		origin: (origin, callback) => callback(null, Boolean(origin && allowedFrontendOrigins.has(origin))),
		credentials: true,
		methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
		maxAge: 600,
		optionsSuccessStatus: 204,
	}));
	app.use((req, res, next) => {
		if (/^\/client-api(?:\/|\?|$)/.test(req.url)) {
			req.clientApiProxy = true;
			req.headers['x-api-key'] = frontendApiKey;
			req.url = req.url.replace(/^\/client-api(?=\/|\?|$)/, '/api');
		}
		next();
	});
	app.use(security.authenticate);
	app.use(security.rateLimit);
	app.use(express.json({ limit: '1mb' }));
	app.use((req, res, next) => {
		if (!req.clientApiProxy && !req.browserClient) return next();

		const publicProxyRoute = (
			(req.method === 'POST' && (req.path === '/api/users/login' || req.path === '/api/users')) ||
			(req.method === 'GET' && req.path === '/api/health')
		);
		if (publicProxyRoute) return next();
		return userAuth.requireUser(req, res, next);
	});

	app.get('/stats', statsHandler);

	app.get('/', (req, res) => {
		res.json({ message: 'Artist API is running' });
	});

	app.get('/api/health', async (req, res) => {
		try {
			await db.query('SELECT 1');
			res.json({ api: 'ok', database: 'connected' });
		} catch (err) {
			console.error('Database health check failed:', err.code || err.name || 'unknown error');
			res.status(503).json({ api: 'ok', database: 'disconnected' });
		}
	});

	app.get(['/upcoming', '/api/upcoming'], async (req, res) => {
		const partnerUrl = process.env.PARTNER_URL;
		const partnerApiKey = process.env.PARTNER_API_KEY;

		if (!partnerUrl || !partnerApiKey) {
			return res.status(503).json({ message: 'Partner integration is not configured.' });
		}

		try {
			const upstreamResponse = await fetch(`${partnerUrl}/tasks?status=active`, {
				headers: { 'X-API-Key': partnerApiKey },
			});
			if (!upstreamResponse.ok) {
				console.error('Partner returned', upstreamResponse.status);
				return res.status(502).json({ message: 'Partner data unavailable' });
			}
			const tasks = await upstreamResponse.json();
			return res.json(tasks.map((task) => ({
				title: task.title,
				dueDate: task.dueDate ?? task.due_date ?? task.deadline,
			})));
		} catch (err) {
			console.error('partner call failed:', err.cause?.code || err.message);
			return res.status(502).json({ message: 'Partner data unavailable' });
		}
	});

	app.get('/api/artisans', async (req, res) => {
		const artisansApiUrl = process.env.ARTISANS_API_URL;
		const artisansApiKey = process.env.ARTISANS_API_KEY;
		if (!artisansApiUrl || !artisansApiKey) {
			return res.status(503).json({ message: 'Artisans integration is not configured.' });
		}

		try {
			const upstreamResponse = await fetch(artisansApiUrl, {
				headers: { 'X-API-Key': artisansApiKey },
			});
			if (!upstreamResponse.ok) {
				console.error('Artisans API returned HTTP', upstreamResponse.status);
				return res.status(502).json({ message: 'Artisans data is currently unavailable.' });
			}

			const artisans = await upstreamResponse.json();
			if (!Array.isArray(artisans)) {
				console.error('Artisans API returned an invalid response.');
				return res.status(502).json({ message: 'Artisans data is currently unavailable.' });
			}

			const artisansWithPhones = await Promise.all(artisans.map(async (artisan) => {
				if (artisan.id === null || artisan.id === undefined || String(artisan.id).trim() === '') {
					throw new Error('Artisans API returned an artisan without an ID.');
				}

				const detailUrl = new URL(
					encodeURIComponent(String(artisan.id)),
					`${artisansApiUrl.replace(/\/+$/, '')}/`,
				);
				const detailResponse = await fetch(detailUrl, {
					headers: { 'X-API-Key': artisansApiKey },
				});
				if (!detailResponse.ok) {
					console.error('Artisans API detail returned HTTP', detailResponse.status);
					throw new Error('Artisans API detail request failed.');
				}

				const detail = await detailResponse.json();
				const record = detail?.data ?? detail?.artisan ?? detail;
				if (!record || typeof record !== 'object' || Array.isArray(record)) {
					throw new Error('Artisans API returned an invalid artisan detail.');
				}

				return { ...artisan, phone: record.phone ?? artisan.phone };
			}));

			return res.json(artisansWithPhones);
		} catch (err) {
			console.error('Artisans API call failed:', err.cause?.code || err.code || err.message);
			return res.status(502).json({ message: 'Artisans data is currently unavailable.' });
		}
	});

	const artistRoutes = require('./routes/artists');
	const songRoutes = require('./routes/songs');
	const userRoutes = require('./routes/users');
	const profileRoutes = require('./routes/profiles');
	const bookingRoutes = require('./routes/bookings');
	const venueRoutes = require('./routes/venues');
	app.use('/api/artists', artistRoutes);
	app.use('/artists', artistRoutes);
	app.use('/api/songs', songRoutes);
	app.use('/api/users', userRoutes);
	app.use('/users', userRoutes);
	app.use('/api/profiles', profileRoutes);
	app.use('/api/bookings', bookingRoutes);
	app.use('/api/venues', venueRoutes);

	app.use((req, res) => {
		res.status(404).json({ error: 'Not found.' });
	});
	app.use((err, req, res, next) => {
		if (res.headersSent) return next(err);
		if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
			return res.status(400).json({ error: 'Invalid JSON request body.' });
		}
		console.error('Unhandled API error:', err.code || err.name || 'unknown error');
		return res.status(500).json({ error: 'Internal server error.' });
	});

	return app;
}

if (require.main === module) {
	const app = createApp();
	const PORT = process.env.PORT || 5000;
	app.listen(PORT, () => {
		console.log(`Server running on port ${PORT}`);
	});
}

module.exports = { createApp };
