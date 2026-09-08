const express = require('express');
const router = express.Router();
const db = require('../db');

const selectBooking = `
  SELECT id, artist_id AS artistId, venue_id AS venueId, event_date AS eventDate,
    offered_fee AS offeredFee, status, notes, created_at AS createdAt
  FROM bookings
`;

router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`${selectBooking} ORDER BY event_date ASC, created_at DESC`);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch bookings.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(`${selectBooking} WHERE id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Booking not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch booking.' });
  }
});

router.post('/', async (req, res) => {
  const { artistId, venueId, eventDate, offeredFee, status = 'Pending', notes } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO bookings (artist_id, venue_id, event_date, offered_fee, status, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [artistId, venueId, eventDate, offeredFee, status, notes],
    );
    const [rows] = await db.query(`${selectBooking} WHERE id = ?`, [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create booking.' });
  }
});

router.put('/:id', async (req, res) => {
  const { artistId, venueId, eventDate, offeredFee, status, notes } = req.body;
  try {
    const [result] = await db.query(
      'UPDATE bookings SET artist_id = ?, venue_id = ?, event_date = ?, offered_fee = ?, status = ?, notes = ? WHERE id = ?',
      [artistId, venueId, eventDate, offeredFee, status, notes, req.params.id],
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Booking not found.' });
    const [rows] = await db.query(`${selectBooking} WHERE id = ?`, [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update booking.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM bookings WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Booking not found.' });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete booking.' });
  }
});

module.exports = router;
