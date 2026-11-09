const express = require('express');
const router = express.Router();
const db = require('../db');
const { hashPassword, verifyPassword } = require('../lib/passwords');
const logError = require('../lib/logError');
const userAuth = require('../middleware/userAuth');

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const [rows] = await db.query(
      'SELECT id, name, email, role, password FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1',
      [email],
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = rows[0];
    const verification = await verifyPassword(password, user.password);
    if (!verification.valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (verification.needsUpgrade) {
      await db.query('UPDATE users SET password = ? WHERE id = ?', [
        await hashPassword(password),
        user.id,
      ]);
    }

    const publicUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      accessToken: userAuth.issueUserToken(user),
      expiresIn: userAuth.TOKEN_TTL_SECONDS,
    };
    res.json(publicUser);
  } catch (err) {
    logError('User login', err);
    res.status(500).json({ error: 'Failed to log in.' });
  }
});

router.post('/', async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (
    typeof name !== 'string' ||
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    !name ||
    !email ||
    !password ||
    !['artist', 'venue'].includes(role)
  ) {
    return res.status(400).json({ error: 'Name, email, password, and a valid role are required.' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, await hashPassword(password), role],
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
    logError('User registration', err);
    res.status(500).json({ error: 'Failed to create account.' });
  }
});
const selectUser = 'SELECT id, name, email, role, created_at AS createdAt FROM users';

router.get('/', userAuth.requireUser, async (req, res) => {
  try {
    const [rows] = await db.query(`${selectUser} WHERE id = ?`, [req.user.id]);
    res.json(rows);
  } catch (err) {
    logError('User list', err);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

router.get('/:id', userAuth.requireUser, userAuth.requireOwner('id'), async (req, res) => {
  try {
    const [rows] = await db.query(`${selectUser} WHERE id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found.' });
    res.json(rows[0]);
  } catch (err) {
    logError('User lookup', err);
    res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

router.put('/:id', userAuth.requireUser, userAuth.requireOwner('id'), async (req, res) => {
  const { name, email, password } = req.body || {};
  if (
    typeof name !== 'string' ||
    typeof email !== 'string' ||
    !name ||
    !email ||
    (password !== undefined && (typeof password !== 'string' || !password))
  ) {
    return res.status(400).json({ error: 'Name and email are required; password must be a non-empty string when supplied.' });
  }
  try {
    const fields = ['name = ?', 'email = ?'];
    const values = [name, email];
    if (password) {
      fields.push('password = ?');
      values.push(await hashPassword(password));
    }
    values.push(req.params.id);
    const [result] = await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    if (!result.affectedRows) return res.status(404).json({ error: 'User not found.' });
    const [rows] = await db.query(`${selectUser} WHERE id = ?`, [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This email is already registered.' });
    logError('User update', err);
    res.status(500).json({ error: 'Failed to update user.' });
  }
});

router.delete('/:id', userAuth.requireUser, userAuth.requireOwner('id'), async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'User not found.' });
    res.status(204).end();
  } catch (err) {
    logError('User deletion', err);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

module.exports = router;