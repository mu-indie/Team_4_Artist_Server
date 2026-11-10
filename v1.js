const express = require('express');
const deprecate = require('./deprecate');
const artistRoutes = require('./routes/artists');
const bookingRoutes = require('./routes/bookings');
const venueRoutes = require('./routes/venues');

const router = express.Router();

router.use(['/api/artists', '/artists', '/api/bookings', '/api/venues'], deprecate);
router.use('/api/artists', artistRoutes);
router.use('/artists', artistRoutes);
router.use('/api/bookings', bookingRoutes);
router.use('/api/venues', venueRoutes);

module.exports = router;
