const express = require('express');
const router = express.Router();
const db = require('../db');
const logError = require('../lib/logError');
const userAuth = require('../middleware/userAuth');
const selectArtist = 'SELECT id, name, genre, bio FROM artists';
const artistWriteDisabled = (_req, res) => (
	res.status(403).json({ error: 'Artist writes are disabled until ownership migration and authorization are verified.' })
);

router.get('/', async (req, res) => {
	try {
		const [rows] = await db.query(`${selectArtist} ORDER BY id DESC`);
		res.json(rows);
	} catch (err) {
		logError('Artist list', err);
		res.status(500).json({ error: 'Failed to fetch artists.' });
	}
});

router.get('/:id', async (req, res) => {
	try {
		const [rows] = await db.query(`${selectArtist} WHERE id = ?`, [req.params.id]);
		if (!rows.length) return res.status(404).json({ error: 'Artist not found.' });
		res.json(rows[0]);
	} catch (err) {
		logError('Artist lookup', err);
		res.status(500).json({ error: 'Failed to fetch artist.' });
	}
});

router.post('/', userAuth.requireUser, userAuth.requireRole('artist'), artistWriteDisabled);
router.put('/:id', userAuth.requireUser, userAuth.requireRole('artist'), artistWriteDisabled);
router.delete('/:id', userAuth.requireUser, userAuth.requireRole('artist'), artistWriteDisabled);

module.exports = router;
