const express = require('express');
const router = express.Router();
const db = require('../db');
const logError = require('../lib/logError');
const userAuth = require('../middleware/userAuth');
const { parseUserId } = require('../middleware/userAuth');

const BOOKING_STATUSES = new Set(['Pending', 'Accepted', 'Confirmed', 'Rejected', 'Declined', 'Cancelled', 'Completed']);
const TERMINAL_BOOKING_STATUSES = new Set(['Rejected', 'Declined', 'Cancelled', 'Completed']);

function validateBooking(body, { creating = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'A booking object is required.';
  }

  for (const field of ['artistId', 'venueId']) {
    if (creating && body[field] === undefined) return `${field} is required.`;
    if (body[field] !== undefined && parseUserId(body[field]) === undefined) {
      return `${field} must be a positive integer.`;
    }
  }

  if (body.eventDate !== undefined) {
    const parsedDate = typeof body.eventDate === 'string'
      ? new Date(`${body.eventDate}T00:00:00.000Z`)
      : undefined;
    if (
      !parsedDate ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.eventDate) ||
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== body.eventDate
    ) {
      return 'eventDate must be a valid date in YYYY-MM-DD format.';
    }
  }

  if (body.offeredFee !== undefined &&
      (typeof body.offeredFee !== 'number' || !Number.isFinite(body.offeredFee))) {
    return 'offeredFee must be a number.';
  }
  if (body.notes !== undefined && typeof body.notes !== 'string') {
    return 'notes must be a string.';
  }

  return undefined;
}

function requireBookingParticipant(req, res, next) {
  const ownerField = req.user.role === 'artist' ? 'artistId' : 'venueId';
  if (!req.body || req.body[ownerField] === undefined) {
    return res.status(400).json({ error: `${ownerField} is required.` });
  }
  if (parseUserId(req.body[ownerField]) !== req.user.id) {
    return res.status(403).json({ error: 'You can only modify bookings you own.' });
  }
  return next();
}

function statusTransitionError(currentStatus, nextStatus, user, booking) {
  if (!BOOKING_STATUSES.has(nextStatus)) {
    return { status: 400, error: 'Invalid booking status.' };
  }
  if (nextStatus === currentStatus) return undefined;
  if (TERMINAL_BOOKING_STATUSES.has(currentStatus)) {
    return { status: 409, error: 'A terminal booking status cannot be reopened.' };
  }

  if (currentStatus === 'Pending' && ['Accepted', 'Confirmed', 'Rejected', 'Declined'].includes(nextStatus)) {
    if (!booking.createdByUserId) {
      return { status: 409, error: 'The booking initiator is unknown; status cannot be confirmed or declined.' };
    }
    if (user.id === booking.createdByUserId) {
      return { status: 403, error: 'Only the invited participant can confirm or decline a booking.' };
    }
    return undefined;
  }

  if (
    (currentStatus === 'Pending' && nextStatus === 'Cancelled') ||
    (['Accepted', 'Confirmed'].includes(currentStatus) && ['Cancelled', 'Completed'].includes(nextStatus))
  ) {
    return undefined;
  }

  return { status: 409, error: 'This booking status transition is not allowed.' };
}

const selectBooking = `
  SELECT id, artist_id AS artistId, venue_id AS venueId, event_date AS eventDate,
    created_by_user_id AS createdByUserId, offered_fee AS offeredFee, status, notes,
    created_at AS createdAt
  FROM bookings
`;

router.get('/', userAuth.requireUser, async (req, res) => {
  try {
    const [rows] = await db.query(
      `${selectBooking} WHERE artist_id = ? OR venue_id = ? ORDER BY event_date ASC, created_at DESC`,
      [req.user.id, req.user.id],
    );
    res.json(rows);
  } catch (err) {
    logError('Booking list', err);
    res.status(500).json({ error: 'Failed to fetch bookings.' });
  }
});

router.get('/:id', userAuth.requireUser, async (req, res) => {
  try {
    const [rows] = await db.query(
      `${selectBooking} WHERE id = ? AND (artist_id = ? OR venue_id = ?)`,
      [req.params.id, req.user.id, req.user.id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Booking not found.' });
    res.json(rows[0]);
  } catch (err) {
    logError('Booking lookup', err);
    res.status(500).json({ error: 'Failed to fetch booking.' });
  }
});

router.post('/', userAuth.requireUser, userAuth.requireRole('artist', 'venue'),
  requireBookingParticipant, async (req, res) => {
  const validationError = validateBooking(req.body, { creating: true });
  if (validationError) return res.status(400).json({ error: validationError });

  const { artistId, venueId, eventDate, offeredFee, status, notes } = req.body;
  if (status !== undefined && status !== 'Pending') {
    return res.status(400).json({ error: 'New bookings must start with Pending status.' });
  }
  try {
    const [result] = await db.query(
      'INSERT INTO bookings (artist_id, venue_id, created_by_user_id, event_date, offered_fee, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [artistId, venueId, req.user.id, eventDate, offeredFee, 'Pending', notes],
    );
    const [rows] = await db.query(`${selectBooking} WHERE id = ?`, [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    logError('Booking creation', err);
    res.status(500).json({ error: 'Failed to create booking.' });
  }
});

router.put('/:id', userAuth.requireUser, userAuth.requireRole('artist', 'venue'),
  requireBookingParticipant, async (req, res) => {
  const body = req.body || {};
  const validationError = validateBooking(body);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const ownerColumn = req.user.role === 'artist' ? 'artist_id' : 'venue_id';
    const [existingRows] = await db.query(
      `SELECT artist_id AS artistId, venue_id AS venueId, created_by_user_id AS createdByUserId,
        event_date AS eventDate, offered_fee AS offeredFee, status, notes
       FROM bookings WHERE id = ? AND ${ownerColumn} = ?`,
      [req.params.id, req.user.id],
    );
    if (!existingRows.length) return res.status(404).json({ error: 'Booking not found.' });
    const booking = existingRows[0];

    if (
      (body.artistId !== undefined && parseUserId(body.artistId) !== booking.artistId) ||
      (body.venueId !== undefined && parseUserId(body.venueId) !== booking.venueId)
    ) {
      return res.status(403).json({ error: 'Booking participants cannot be changed.' });
    }

    const nextStatus = body.status === undefined ? booking.status : body.status;
    const transitionError = statusTransitionError(booking.status, nextStatus, req.user, booking);
    if (transitionError) {
      return res.status(transitionError.status).json({ error: transitionError.error });
    }

    const [result] = await db.query(
      `UPDATE bookings SET event_date = ?, offered_fee = ?, status = ?, notes = ? WHERE id = ? AND ${ownerColumn} = ? AND status = ?`,
      [
        body.eventDate === undefined ? booking.eventDate : body.eventDate,
        body.offeredFee === undefined ? booking.offeredFee : body.offeredFee,
        nextStatus,
        body.notes === undefined ? booking.notes : body.notes,
        req.params.id,
        req.user.id,
        booking.status,
      ],
    );
    if (!result.affectedRows) {
      const [currentRows] = await db.query(
        `${selectBooking} WHERE id = ? AND ${ownerColumn} = ?`,
        [req.params.id, req.user.id],
      );
      if (!currentRows.length) return res.status(404).json({ error: 'Booking not found.' });
      if (currentRows[0].status !== booking.status) {
        return res.status(409).json({ error: 'The booking changed; reload it before updating.' });
      }
      return res.json(currentRows[0]);
    }
    const [rows] = await db.query(`${selectBooking} WHERE id = ?`, [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    logError('Booking update', err);
    res.status(500).json({ error: 'Failed to update booking.' });
  }
});

router.delete('/:id', userAuth.requireUser, userAuth.requireRole('artist', 'venue'), async (req, res) => {
  try {
    const ownerColumn = req.user.role === 'artist' ? 'artist_id' : 'venue_id';
    const [result] = await db.query(
      `DELETE FROM bookings WHERE id = ? AND ${ownerColumn} = ?`,
      [req.params.id, req.user.id],
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Booking not found.' });
    res.status(204).end();
  } catch (err) {
    logError('Booking deletion', err);
    res.status(500).json({ error: 'Failed to delete booking.' });
  }
});

module.exports = router;
