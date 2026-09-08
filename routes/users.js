const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await db.query(
      'SELECT id, name, email, role FROM users WHERE LOWER(email) = LOWER(?) AND password = ? LIMIT 1',
      [email, password],
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to log in.' });
  }
});

router.post('/', async (req, res) => {
  const { name, email, password, role } = req.body;

  try {
    const [result] = await db.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, password, role],
    );
    const [rows] = await db.query(
      'SELECT id, name, email, role FROM users WHERE id = ?',
      [result.insertId],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'This email is already registered.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create account.' });
  }
});
const selectUser = 'SELECT id, name, email, role, created_at AS createdAt FROM users';

router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`${selectUser} ORDER BY id DESC`);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(`${selectUser} WHERE id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

router.put('/:id', async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    const fields = ['name = ?', 'email = ?', 'role = ?'];
    const values = [name, email, role];
    if (password) {
      fields.push('password = ?');
      values.push(password);
    }
    values.push(req.params.id);
    const [result] = await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    if (!result.affectedRows) return res.status(404).json({ error: 'User not found.' });
    const [rows] = await db.query(`${selectUser} WHERE id = ?`, [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This email is already registered.' });
    console.error(err);
    res.status(500).json({ error: 'Failed to update user.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'User not found.' });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

module.exports = router;