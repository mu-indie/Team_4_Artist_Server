const express = require('express');
const artistRoutes = require('./routes/artists');
const bookingRoutes = require('./routes/bookings');
const venueRoutes = require('./routes/venues');

const router = express.Router();

function wrapV2Success(payload) {
	if (Array.isArray(payload)) {
		return { data: payload, count: payload.length };
	}
	if (
		payload &&
		typeof payload === 'object' &&
		!Array.isArray(payload) &&
		!('error' in payload) &&
		!('message' in payload) &&
		!('data' in payload) &&
		!('count' in payload)
	) {
		return { data: payload };
	}
	return payload;
}

router.use((req, res, next) => {
	const originalJson = res.json.bind(res);
	res.json = (payload) => originalJson(wrapV2Success(payload));
	next();
});

router.use('/api/artists', artistRoutes);
router.use('/api/bookings', bookingRoutes);
router.use('/api/venues', venueRoutes);

module.exports = router;
