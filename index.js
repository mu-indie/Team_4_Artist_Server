const express = require('express');
const cors = require('cors');
const db = require('./db');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 5000;
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: frontendOrigin }));
app.use(express.json());

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
