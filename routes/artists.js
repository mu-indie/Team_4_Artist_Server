const express = require('express');
const router = express.Router();
const db = require('../db');
// GET all artists
router.get('/', async (req, res) => {
try {
const [rows] = await db.query('SELECT * FROM artists');
res.json(rows);
} catch (err) {
console.error(err);
res.status(500).json({ error: 'Failed to fetch artists' });
}
});
module.exports = router;
