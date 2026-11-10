const express = require('express');
const cors = require('cors');
const db = require('./db');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 5000;
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: frontendOrigin }));
app.use(express.json());

function getArtisansListUrl(rawUrl) {
	if (!rawUrl || !rawUrl.trim()) return null;

	try {
		const url = new URL(rawUrl.trim());
		if (!['http:', 'https:'].includes(url.protocol)) return null;

		const pathname = url.pathname.replace(/\/+$/, '');
		if (!/\/api\/artisans$/i.test(pathname)) {
			url.pathname = pathname ? `${pathname}/api/artisans` : '/api/artisans';
		}
		return url;
	} catch {
		return null;
	}
}

function extractArtisans(payload) {
	if (Array.isArray(payload)) return payload;
	if (payload && typeof payload === 'object') {
		for (const key of ['data', 'artisans', 'results', 'items']) {
			if (Array.isArray(payload[key])) return payload[key];
		}
	}
	return null;
}

app.get('/', (req, res) => {
	res.json({ message: 'Artist API is running' });
});

app.get('/api/health', async (req, res) => {
	try {
		await db.query('SELECT 1');
		res.json({ api: 'ok', database: 'connected' });
	} catch (err) {
		console.error('Database health check failed:', err.message);
		res.status(503).json({ api: 'ok', database: 'disconnected' });
	}
});

app.get('/api/artisans', async (req, res) => {
	const artisansApiKey = process.env.ARTISANS_API_KEY;
	const artisansListUrl = getArtisansListUrl(process.env.ARTISANS_API_URL);
	if (!artisansApiKey || !artisansListUrl) {
		return res.status(503).json({ message: 'Artisans integration is not configured.' });
	}

	const detailBaseUrl = `${artisansListUrl.toString().replace(/\/+$/, '')}/`;
	const fetchJson = async (url) => {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 10000);
		try {
			const response = await fetch(url, {
				headers: { 'X-API-Key': artisansApiKey },
				signal: controller.signal,
			});
			return response;
		} finally {
			clearTimeout(timeout);
		}
	};

	try {
		const upstreamResponse = await fetchJson(artisansListUrl);
		if (!upstreamResponse.ok) {
			console.error('Artisans API returned HTTP', upstreamResponse.status);
			return res.status(502).json({ message: 'Artisans data is currently unavailable.' });
		}

		const artisans = extractArtisans(await upstreamResponse.json());
		if (!artisans) {
			console.error('Artisans API returned an invalid response.');
			return res.status(502).json({ message: 'Artisans data is currently unavailable.' });
		}

		const artisansWithPhones = await Promise.all(artisans.map(async (artisan) => {
			if (artisan.id === null || artisan.id === undefined || String(artisan.id).trim() === '') {
				throw new Error('Artisans API returned an artisan without an ID.');
			}

			const detailUrl = new URL(encodeURIComponent(String(artisan.id)), detailBaseUrl);
			const detailResponse = await fetchJson(detailUrl);
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
		if (err?.name === 'AbortError') {
			console.error('Artisans API request timed out.');
			return res.status(504).json({ message: 'Artisans API request timed out.' });
		}
		console.error('Artisans API call failed:', err.cause?.code || err.code || err.name || 'unknown error');
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

app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
});
