'use strict';
const express = require('express');
const events = require('../services/eventService');
const tickets = require('../services/ticketService');
const { requireAdmin } = require('../middleware/auth');
const { validateEvent, toInt } = require('../services/validators');
const { HttpError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(requireAdmin);

router.get('/stats', (req, res, next) => {
  try { res.json(events.stats()); } catch (err) { next(err); }
});

// ---- Event CRUD ----
router.get('/events', (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const status = ['draft', 'published', 'closed', 'cancelled'].includes(req.query.status) ? req.query.status : '';
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 200);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    res.json({ ...events.listAll({ q, status, limit, offset: (page - 1) * limit }), page, limit });
  } catch (err) { next(err); }
});

router.get('/events/:id', (req, res, next) => {
  try { res.json({ event: events.getById(toInt(req.params.id), { includeDraft: true }) }); } catch (err) { next(err); }
});

router.post('/events', (req, res, next) => {
  try {
    const data = validateEvent(req.body);
    res.status(201).json({ event: events.create(data) });
  } catch (err) { next(err); }
});

router.put('/events/:id', (req, res, next) => {
  try {
    const data = validateEvent(req.body);
    res.json({ event: events.update(toInt(req.params.id), data) });
  } catch (err) { next(err); }
});

router.patch('/events/:id/status', (req, res, next) => {
  try { res.json({ event: events.setStatus(toInt(req.params.id), String(req.body.status)) }); } catch (err) { next(err); }
});

router.delete('/events/:id', (req, res, next) => {
  try { res.json({ event: events.remove(toInt(req.params.id)) }); } catch (err) { next(err); }
});

// ---- Attendees ----
router.get('/events/:id/attendees', (req, res, next) => {
  try {
    const eventId = toInt(req.params.id);
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 200);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const event = events.getById(eventId, { includeDraft: true });
    res.json({ event, ...events.attendees(eventId, { q, status, limit, offset: (page - 1) * limit }), page, limit });
  } catch (err) { next(err); }
});

router.get('/events/:id/attendees.csv', (req, res, next) => {
  try {
    const eventId = toInt(req.params.id);
    const event = events.getById(eventId, { includeDraft: true });
    const { attendees } = events.attendees(eventId, { limit: 100000 });
    const esc = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      // Prefix formula-looking cells to avoid CSV injection in spreadsheet apps.
      const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const lines = [['Full Name', 'Email', 'Ticket Code', 'Status', 'Registered At', 'Checked In At'].map(esc).join(',')];
    for (const a of attendees) {
      lines.push([a.full_name, a.email, a.ticket_token, a.registration_status, a.registered_at, a.checked_in_at || ''].map(esc).join(','));
    }
    const filename = `attendees-${event.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + lines.join('\r\n'));
  } catch (err) { next(err); }
});

// ---- Check-in ----
router.post('/checkin/verify', (req, res, next) => {
  try {
    const eventId = req.body.event_id ? toInt(req.body.event_id, 'event id') : null;
    const result = tickets.verify(String(req.body.token || ''), eventId);
    res.status(result.ok ? 200 : 422).json({ ...result, ticket: result.ticket || null });
  } catch (err) { next(err); }
});

router.post('/checkin', (req, res, next) => {
  try {
    if (!req.body.event_id) throw new HttpError(400, 'Please select an event before checking in tickets.');
    const eventId = toInt(req.body.event_id, 'event id');
    const result = tickets.checkIn(String(req.body.token || ''), eventId);
    res.status(result.ok ? 200 : 422).json({ ...result, ticket: result.ticket || null });
  } catch (err) { next(err); }
});

module.exports = router;
