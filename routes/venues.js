const express = require('express');
const router = express.Router();
const db = require('../db');
const logError = require('../lib/logError');
const userAuth = require('../middleware/userAuth');

const KENYA_COUNTIES = new Set([
  'Mombasa', 'Kwale', 'Kilifi', 'Tana River', 'Lamu', 'Taita–Taveta', 'Garissa',
  'Wajir', 'Mandera', 'Marsabit', 'Isiolo', 'Meru', 'Tharaka-Nithi', 'Embu',
  'Kitui', 'Machakos', 'Makueni', 'Nyandarua', 'Nyeri', 'Kirinyaga', "Murang'a",
  'Kiambu', 'Turkana', 'West Pokot', 'Samburu', 'Trans-Nzoia', 'Uasin Gishu',
  'Elgeyo-Marakwet', 'Nandi', 'Baringo', 'Laikipia', 'Nakuru', 'Narok', 'Kajiado',
  'Kericho', 'Bomet', 'Kakamega', 'Vihiga', 'Bungoma', 'Busia', 'Siaya', 'Kisumu',
  'Homa Bay', 'Migori', 'Kisii', 'Nyamira', 'Nairobi',
]);

const selectVenue = `
  SELECT id, user_id AS userId, venue_name AS venueName, location, capacity,
    supported_genres AS supportedGenres, description, created_at AS createdAt,
    updated_at AS updatedAt
  FROM venue_profiles
`;

function validateVenue(body, { requireKenyaCounty = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'A venue profile object is required.';
  }

  const requiredTextFields = {
    venueName: 255,
    location: 255,
  };
  for (const [field, maxLength] of Object.entries(requiredTextFields)) {
    if (typeof body[field] !== 'string' || body[field].trim() === '') {
      return `${field} is required.`;
    }
    if (Array.from(body[field]).length > maxLength) {
      return `${field} must be ${maxLength} characters or fewer.`;
    }
  }
  if (requireKenyaCounty && !KENYA_COUNTIES.has(body.location.trim())) {
    return 'location must be one of the supported Kenyan counties.';
  }

  if (!Number.isSafeInteger(body.capacity) || body.capacity < 0) {
    return 'capacity must be a non-negative integer.';
  }
  if (body.supportedGenres !== undefined && body.supportedGenres !== null) {
    if (typeof body.supportedGenres !== 'string') {
      return 'supportedGenres must be a string.';
    }
    if (Array.from(body.supportedGenres).length > 255) {
      return 'supportedGenres must be 255 characters or fewer.';
    }
  }
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== 'string') {
      return 'description must be a string.';
    }
    if (Buffer.byteLength(body.description, 'utf8') > 65535) {
      return 'description must be 65,535 UTF-8 bytes or fewer.';
    }
  }

  return undefined;
}

router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`${selectVenue} ORDER BY updated_at DESC`);
    res.json(rows);
  } catch (err) {
    logError('Venue profile list', err);
    res.status(500).json({ error: 'Failed to fetch venue profiles.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(`${selectVenue} WHERE id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Venue profile not found.' });
    res.json(rows[0]);
  } catch (err) {
    logError('Venue profile lookup', err);
    res.status(500).json({ error: 'Failed to fetch venue profile.' });
  }
});

router.post('/', userAuth.requireUser, userAuth.requireRole('venue'), async (req, res) => {
  const validationError = validateVenue(req.body, { requireKenyaCounty: true });
  if (validationError) return res.status(400).json({ error: validationError });

  const { venueName, location, capacity, supportedGenres, description } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO venue_profiles (user_id, venue_name, location, capacity, supported_genres, description) VALUES (?, ?, ?, ?, ?, ?)',
      [
        req.user.id,
        venueName.trim(),
        location.trim(),
        capacity,
        supportedGenres?.trim() || '',
        description?.trim() || '',
      ],
    );
    const [rows] = await db.query(`${selectVenue} WHERE id = ?`, [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    logError('Venue profile creation', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'The database still restricts each account to one venue profile. Apply the multiple venue profiles migration to the Railway database.',
      });
    }
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ error: 'The venue account associated with this profile no longer exists.' });
    }
    res.status(500).json({ error: 'Failed to create venue profile.' });
  }
});

router.put('/:id', userAuth.requireUser, userAuth.requireRole('venue'), async (req, res) => {
  const validationError = validateVenue(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  const { venueName, location, capacity, supportedGenres, description } = req.body;
  try {
    const [result] = await db.query(
      'UPDATE venue_profiles SET venue_name = ?, location = ?, capacity = ?, supported_genres = ?, description = ? WHERE id = ? AND user_id = ?',
      [
        venueName.trim(),
        location.trim(),
        capacity,
        supportedGenres?.trim() || '',
        description?.trim() || '',
        req.params.id,
        req.user.id,
      ],
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Venue profile not found.' });
    const [rows] = await db.query(`${selectVenue} WHERE id = ?`, [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    logError('Venue profile update', err);
    res.status(500).json({ error: 'Failed to update venue profile.' });
  }
});

router.delete('/:id', userAuth.requireUser, userAuth.requireRole('venue'), async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM venue_profiles WHERE id = ? AND user_id = ?', [
      req.params.id,
      req.user.id,
    ]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Venue profile not found.' });
    res.status(204).end();
  } catch (err) {
    logError('Venue profile deletion', err);
    res.status(500).json({ error: 'Failed to delete venue profile.' });
  }
});

module.exports = router;
