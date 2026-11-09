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

router.get('/artists', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, user_id AS userId, stage_name AS stageName, genre, bio,
        location, performance_fee AS performanceFee, profile_image AS profileImage,
        instagram, youtube, spotify
      FROM artist_profiles
      ORDER BY updated_at DESC
    `);
    res.json(rows.map((profile) => ({
      ...profile,
      socialLinks: {
        instagram: profile.instagram || '',
        youtube: profile.youtube || '',
        spotify: profile.spotify || '',
      },
    })));
  } catch (err) {
    logError('Artist profile list', err);
    res.status(500).json({ error: 'Failed to fetch artist profiles.' });
  }
});

router.get('/artists/:userId', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, user_id AS userId, stage_name AS stageName, genre, bio,
        location, performance_fee AS performanceFee, profile_image AS profileImage,
        instagram, youtube, spotify
      FROM artist_profiles WHERE user_id = ? LIMIT 1
    `, [req.params.userId]);

    if (rows.length === 0) return res.status(404).json({ error: 'Profile not found.' });
    const profile = rows[0];
    res.json({ ...profile, socialLinks: {
      instagram: profile.instagram || '', youtube: profile.youtube || '', spotify: profile.spotify || '',
    } });
  } catch (err) {
    logError('Artist profile lookup', err);
    res.status(500).json({ error: 'Failed to fetch artist profile.' });
  }
});

router.put('/artists/:userId', userAuth.requireUser, userAuth.requireRole('artist'),
  userAuth.requireOwner('userId'), async (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'A profile object is required.' });
  }

  const { stageName, genre, bio, location, performanceFee } = req.body;
  const socialLinks = req.body.socialLinks ?? {};
  if (typeof socialLinks !== 'object' || Array.isArray(socialLinks)) {
    return res.status(400).json({ error: 'Social links must be an object.' });
  }

  const requiredFields = { stageName, genre, bio, location };
  for (const [field, value] of Object.entries(requiredFields)) {
    if (typeof value !== 'string' || value.trim() === '') {
      return res.status(400).json({ error: `${field} is required.` });
    }

    const exceedsLimit = field === 'bio'
      ? Buffer.byteLength(value, 'utf8') > 65535
      : Array.from(value).length > 255;
    if (exceedsLimit) {
      const limit = field === 'bio' ? '65,535 UTF-8 bytes' : '255 characters';
      return res.status(400).json({ error: `${field} must be ${limit} or fewer.` });
    }
  }

  const artistLocations = location.split(',').map((county) => county.trim());
  if (
    artistLocations.length > 4 ||
    artistLocations.some((county) => !KENYA_COUNTIES.has(county)) ||
    new Set(artistLocations).size !== artistLocations.length
  ) {
    return res.status(400).json({
      error: 'location must contain up to 4 unique supported Kenyan counties separated by commas.',
    });
  }

  const maxPerformanceFee = 99999999.99;
  if (typeof performanceFee !== 'number' || !Number.isFinite(performanceFee) ||
      performanceFee <= 0 || performanceFee > maxPerformanceFee) {
    return res.status(400).json({
      error: `performanceFee must be greater than 0 and no more than ${maxPerformanceFee}.`,
    });
  }

  const optionalFields = {
    profileImage: req.body.profileImage,
    instagram: socialLinks.instagram,
    youtube: socialLinks.youtube,
    spotify: socialLinks.spotify,
  };
  for (const [field, value] of Object.entries(optionalFields)) {
    if (value !== undefined && value !== null && typeof value !== 'string') {
      return res.status(400).json({ error: `${field} must be a string.` });
    }
    if (typeof value === 'string' && Array.from(value).length > 500) {
      return res.status(400).json({ error: `${field} must be 500 characters or fewer.` });
    }
  }

  try {
    await db.query(`
      INSERT INTO artist_profiles
        (user_id, stage_name, genre, bio, location, performance_fee, profile_image, instagram, youtube, spotify)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE stage_name = VALUES(stage_name), genre = VALUES(genre), bio = VALUES(bio),
        location = VALUES(location), performance_fee = VALUES(performance_fee), profile_image = VALUES(profile_image),
        instagram = VALUES(instagram), youtube = VALUES(youtube), spotify = VALUES(spotify)
    `, [req.params.userId, stageName, genre, bio, location, performanceFee,
      optionalFields.profileImage ?? null, optionalFields.instagram ?? null,
      optionalFields.youtube ?? null, optionalFields.spotify ?? null]);
    res.json({ message: 'Artist profile saved successfully.' });
  } catch (err) {
    logError('Artist profile update', err);
    res.status(500).json({ error: 'Failed to save artist profile.' });
  }
});

router.delete('/artists/:userId', userAuth.requireUser, userAuth.requireRole('artist'),
  userAuth.requireOwner('userId'), async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM artist_profiles WHERE user_id = ?', [req.params.userId]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Profile not found.' });
    res.status(204).end();
  } catch (err) {
    logError('Artist profile deletion', err);
    res.status(500).json({ error: 'Failed to delete artist profile.' });
  }
});

module.exports = router;