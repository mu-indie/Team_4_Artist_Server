const express = require('express');
const router = express.Router();
const db = require('../db');
const selectArtist = 'SELECT id, name, genre, bio FROM artists';

router.get('/', async (req, res) => {
	try {
		const [rows] = await db.query(`${selectArtist} ORDER BY id DESC`);
		res.json(rows);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Failed to fetch artists.' });
	}
});

router.get('/:id', async (req, res) => {
	try {
		const [rows] = await db.query(`${selectArtist} WHERE id = ?`, [req.params.id]);
		if (!rows.length) return res.status(404).json({ error: 'Artist not found.' });
		res.json(rows[0]);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Failed to fetch artist.' });
	}
});

router.post('/', async (req, res) => {
	const { name, genre, bio } = req.body;
	try {
		const [result] = await db.query(
			'INSERT INTO artists (name, genre, bio) VALUES (?, ?, ?)',
			[name, genre, bio],
		);
		const [rows] = await db.query(`${selectArtist} WHERE id = ?`, [result.insertId]);
		res.status(201).json(rows[0]);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Failed to create artist.' });
	}
});

router.put('/:id', async (req, res) => {
	const { name, genre, bio } = req.body;
	try {
		const [result] = await db.query(
			'UPDATE artists SET name = ?, genre = ?, bio = ? WHERE id = ?',
			[name, genre, bio, req.params.id],
		);
		if (!result.affectedRows) return res.status(404).json({ error: 'Artist not found.' });
		const [rows] = await db.query(`${selectArtist} WHERE id = ?`, [req.params.id]);
		res.json(rows[0]);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Failed to update artist.' });
	}
});

router.delete('/:id', async (req, res) => {
	try {
		const [result] = await db.query('DELETE FROM artists WHERE id = ?', [req.params.id]);
		if (!result.affectedRows) return res.status(404).json({ error: 'Artist not found.' });
		res.status(204).end();
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Failed to delete artist.' });
	}
});

module.exports = router;
