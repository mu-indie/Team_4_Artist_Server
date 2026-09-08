const express = require('express');
const router = express.Router();
const db = require('../db');

const selectVenue = `
  SELECT id, user_id AS userId, venue_name AS venueName, location, capacity,
    supported_genres AS supportedGenres, description, created_at AS createdAt,
    updated_at AS updatedAt
  FROM venue_profiles
`;

router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`${selectVenue} ORDER BY updated_at DESC`);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch venue profiles.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(`${selectVenue} WHERE id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Venue profile not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch venue profile.' });
  }
});

router.post('/', async (req, res) => {
  const { userId, venueName, location, capacity, supportedGenres, description } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO venue_profiles (user_id, venue_name, location, capacity, supported_genres, description) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, venueName, location, capacity, supportedGenres, description],
    );
    const [rows] = await db.query(`${selectVenue} WHERE id = ?`, [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create venue profile.' });
  }
});

router.put('/:id', async (req, res) => {
  const { userId, venueName, location, capacity, supportedGenres, description } = req.body;
  try {
    const [result] = await db.query(
      'UPDATE venue_profiles SET user_id = ?, venue_name = ?, location = ?, capacity = ?, supported_genres = ?, description = ? WHERE id = ?',
      [userId, venueName, location, capacity, supportedGenres, description, req.params.id],
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Venue profile not found.' });
    const [rows] = await db.query(`${selectVenue} WHERE id = ?`, [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update venue profile.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM venue_profiles WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Venue profile not found.' });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete venue profile.' });
  }
});

module.exports = router;
