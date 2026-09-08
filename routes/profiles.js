const express = require('express');
const router = express.Router();
const db = require('../db');

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
    console.error(err);
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
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch artist profile.' });
  }
});

router.put('/artists/:userId', async (req, res) => {
  const { stageName, genre, bio, location, performanceFee, profileImage, socialLinks = {} } = req.body;
  try {
    await db.query(`
      INSERT INTO artist_profiles
        (user_id, stage_name, genre, bio, location, performance_fee, profile_image, instagram, youtube, spotify)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE stage_name = VALUES(stage_name), genre = VALUES(genre), bio = VALUES(bio),
        location = VALUES(location), performance_fee = VALUES(performance_fee), profile_image = VALUES(profile_image),
        instagram = VALUES(instagram), youtube = VALUES(youtube), spotify = VALUES(spotify)
    `, [req.params.userId, stageName, genre, bio, location, performanceFee, profileImage,
      socialLinks.instagram, socialLinks.youtube, socialLinks.spotify]);
    res.json({ message: 'Artist profile saved successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save artist profile.' });
  }
});

router.delete('/artists/:userId', async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM artist_profiles WHERE user_id = ?', [req.params.userId]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Profile not found.' });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete artist profile.' });
  }
});

module.exports = router;