const express = require('express');
const router = express.Router();
const db = require('../db');
const logError = require('../lib/logError');
const userAuth = require('../middleware/userAuth');
const selectSong = `
  SELECT id, artist_id AS artistId, title, genre, description,
    audio_url AS audioUrl, cover_image AS coverImage,
    upload_date AS uploadDate, created_at AS createdAt
  FROM songs
`;

function validateSong(body) {
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return 'A song object is required.';
	}

	const stringLimits = {
		title: 255,
		genre: 255,
		audioUrl: 500,
		coverImage: 500,
	};
	for (const [field, maxLength] of Object.entries(stringLimits)) {
		if (typeof body[field] !== 'string' || body[field].trim() === '') {
			return `${field} is required.`;
		}
		if (Array.from(body[field]).length > maxLength) {
			return `${field} must be ${maxLength} characters or fewer.`;
		}
	}

	if (typeof body.description !== 'string' || body.description.trim() === '') {
		return 'description is required.';
	}
	if (Buffer.byteLength(body.description, 'utf8') > 65535) {
		return 'description must be 65,535 UTF-8 bytes or fewer.';
	}

	const uploadDate = typeof body.uploadDate === 'string'
		? new Date(`${body.uploadDate}T00:00:00.000Z`)
		: undefined;
	if (
		!uploadDate ||
		!/^\d{4}-\d{2}-\d{2}$/.test(body.uploadDate) ||
		Number.isNaN(uploadDate.getTime()) ||
		uploadDate.toISOString().slice(0, 10) !== body.uploadDate
	) {
		return 'uploadDate must be a valid date in YYYY-MM-DD format.';
	}

	return undefined;
}

router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`${selectSong} ORDER BY created_at DESC`);
    res.json(rows);
  } catch (err) {
    logError('Song list', err);
    res.status(500).json({ error: 'Failed to fetch songs' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(`${selectSong} WHERE id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Song not found.' });
    res.json(rows[0]);
  } catch (err) {
    logError('Song lookup', err);
    res.status(500).json({ error: 'Failed to fetch song.' });
  }
});

router.post('/', userAuth.requireUser, userAuth.requireRole('artist'),
  userAuth.requireBodyOwner('artistId'), async (req, res) => {
  const validationError = validateSong(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  const { artistId, title, genre, description, audioUrl, coverImage, uploadDate } = req.body;
  try {
    const [result] = await db.query(`
      INSERT INTO songs (artist_id, title, genre, description, audio_url, cover_image, upload_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [artistId, title, genre, description, audioUrl, coverImage, uploadDate]);
    const [rows] = await db.query(`${selectSong} WHERE id = ?`, [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    logError('Song creation', err);
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ error: 'The artist account associated with this song no longer exists.' });
    }
    res.status(500).json({ error: 'Failed to create song.' });
  }
});

router.put('/:id', userAuth.requireUser, userAuth.requireRole('artist'), async (req, res) => {
  const validationError = validateSong(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  const { title, genre, description, audioUrl, coverImage, uploadDate } = req.body;
  try {
    const [result] = await db.query(`
      UPDATE songs SET title = ?, genre = ?, description = ?, audio_url = ?, cover_image = ?, upload_date = ?
      WHERE id = ? AND artist_id = ?
    `, [title, genre, description, audioUrl, coverImage, uploadDate, req.params.id, req.user.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Song not found.' });
    const [rows] = await db.query(`${selectSong} WHERE id = ?`, [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    logError('Song update', err);
    res.status(500).json({ error: 'Failed to update song.' });
  }
});

router.delete('/:id', userAuth.requireUser, userAuth.requireRole('artist'), async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM songs WHERE id = ? AND artist_id = ?', [
      req.params.id,
      req.user.id,
    ]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Song not found.' });
    res.status(204).end();
  } catch (err) {
    logError('Song deletion', err);
    res.status(500).json({ error: 'Failed to delete song.' });
  }
});

module.exports = router;