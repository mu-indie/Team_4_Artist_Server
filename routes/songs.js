const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, artist_id AS artistId, title, genre, description,
        audio_url AS audioUrl, cover_image AS coverImage,
        upload_date AS uploadDate, created_at AS createdAt
      FROM songs ORDER BY created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch songs' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, artist_id AS artistId, title, genre, description,
        audio_url AS audioUrl, cover_image AS coverImage,
        upload_date AS uploadDate, created_at AS createdAt
      FROM songs WHERE id = ?
    `, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Song not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch song.' });
  }
});

router.post('/', async (req, res) => {
  const { artistId, title, genre, description, audioUrl, coverImage, uploadDate } = req.body;
  try {
    const [result] = await db.query(`
      INSERT INTO songs (artist_id, title, genre, description, audio_url, cover_image, upload_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [artistId, title, genre, description, audioUrl, coverImage, uploadDate]);
    const [rows] = await db.query('SELECT * FROM songs WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create song.' });
  }
});

router.put('/:id', async (req, res) => {
  const { title, genre, description, audioUrl, coverImage, uploadDate } = req.body;
  try {
    const [result] = await db.query(`
      UPDATE songs SET title = ?, genre = ?, description = ?, audio_url = ?, cover_image = ?, upload_date = ?
      WHERE id = ?
    `, [title, genre, description, audioUrl, coverImage, uploadDate, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Song not found.' });
    const [rows] = await db.query('SELECT * FROM songs WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update song.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM songs WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Song not found.' });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete song.' });
  }
});

module.exports = router;