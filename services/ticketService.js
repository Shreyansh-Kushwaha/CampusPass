'use strict';
const crypto = require('crypto');
const QRCode = require('qrcode');
const db = require('../database/db');
const { HttpError } = require('../middleware/errorHandler');
const events = require('./eventService');

// Ticket tokens are random, URL-safe and human-readable in groups (e.g. CP-7K3M-9QWD-2XTR-8VBN).
// They never contain database IDs or personal information.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion when typed
function generateTicketToken() {
  const bytes = crypto.randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `CP-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}`;
}

function normalizeToken(raw) {
  if (typeof raw !== 'string') return '';
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = compact.startsWith('CP') ? compact.slice(2) : compact;
  if (body.length !== 16) return '';
  return `CP-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}-${body.slice(12, 16)}`;
}

const TICKET_SELECT = `
  SELECT r.id, r.ticket_token, r.registration_status, r.registered_at, r.checked_in_at,
         r.user_id, r.event_id,
         u.full_name AS student_name, u.email AS student_email,
         e.title AS event_title, e.category, e.venue, e.start_datetime, e.end_datetime, e.status AS event_status
  FROM registrations r
  JOIN users u ON u.id = r.user_id
  JOIN events e ON e.id = r.event_id
`;

// Register a student for an event. The entire check-and-insert runs inside one
// IMMEDIATE transaction, so concurrent requests are serialised by SQLite and the
// capacity check can never be bypassed. The UNIQUE(user_id, event_id) constraint
// is a second line of defence against duplicates.
const registerTx = db.transaction((userId, eventId) => {
  const event = events.getById(eventId);
  const existing = db.prepare('SELECT id, registration_status FROM registrations WHERE user_id = ? AND event_id = ?').get(userId, eventId);
  if (existing && existing.registration_status === 'confirmed') {
    throw new HttpError(409, 'You are already registered for this event.');
  }
  if (event.availability === 'cancelled') throw new HttpError(400, 'This event has been cancelled.');
  if (event.availability === 'ended') throw new HttpError(400, 'This event has already taken place.');
  if (event.availability === 'closed') throw new HttpError(400, 'Registration for this event is closed.');
  if (event.availability === 'full') throw new HttpError(409, 'This event is full.');

  const token = generateTicketToken();
  if (existing) {
    // Previously cancelled: reactivate with a fresh token.
    db.prepare(`UPDATE registrations SET registration_status = 'confirmed', ticket_token = ?,
                registered_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), checked_in_at = NULL WHERE id = ?`).run(token, existing.id);
    return existing.id;
  }
  const info = db.prepare('INSERT INTO registrations (user_id, event_id, ticket_token) VALUES (?, ?, ?)').run(userId, eventId, token);
  return info.lastInsertRowid;
});

function register(userId, eventId) {
  let id;
  try {
    id = registerTx.immediate(userId, eventId);
  } catch (err) {
    if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new HttpError(409, 'You are already registered for this event.');
    throw err;
  }
  return getTicketById(id);
}

function getTicketById(id) {
  const row = db.prepare(`${TICKET_SELECT} WHERE r.id = ?`).get(id);
  if (!row) throw new HttpError(404, 'Ticket not found.');
  return row;
}

function getTicketByToken(token) {
  const normalized = normalizeToken(token);
  if (!normalized) return null;
  return db.prepare(`${TICKET_SELECT} WHERE r.ticket_token = ?`).get(normalized) || null;
}

function listForUser(userId) {
  const now = new Date().toISOString();
  const rows = db.prepare(`${TICKET_SELECT} WHERE r.user_id = ? ORDER BY e.start_datetime ASC`).all(userId);
  return rows.map((r) => ({ ...r, is_past: r.end_datetime < now }));
}

function cancel(userId, registrationId) {
  const reg = db.prepare(`${TICKET_SELECT} WHERE r.id = ? AND r.user_id = ?`).get(registrationId, userId);
  if (!reg) throw new HttpError(404, 'Registration not found.');
  if (reg.registration_status === 'cancelled') throw new HttpError(400, 'This registration is already cancelled.');
  if (reg.checked_in_at) throw new HttpError(400, 'You have already checked in to this event; the registration cannot be cancelled.');
  if (reg.start_datetime < new Date().toISOString()) throw new HttpError(400, 'This event has already started.');
  db.prepare("UPDATE registrations SET registration_status = 'cancelled' WHERE id = ?").run(registrationId);
  return getTicketById(registrationId);
}

async function qrDataUrl(token) {
  return QRCode.toDataURL(token, { errorCorrectionLevel: 'M', margin: 1, width: 320,
    color: { dark: '#1f3d2b', light: '#fffdf8' } });
}

async function qrPngBuffer(token) {
  return QRCode.toBuffer(token, { errorCorrectionLevel: 'M', margin: 2, width: 600, type: 'png',
    color: { dark: '#1f3d2b', light: '#ffffff' } });
}

// Verify a ticket for a given event. Does not modify data.
function verify(token, eventId) {
  const ticket = getTicketByToken(token);
  if (!ticket) return { ok: false, code: 'invalid', message: 'Ticket not found. This code is not valid.' };
  if (eventId && ticket.event_id !== eventId) {
    return { ok: false, code: 'wrong_event', message: `This ticket is for "${ticket.event_title}", not the selected event.`, ticket };
  }
  if (ticket.registration_status !== 'confirmed') return { ok: false, code: 'cancelled', message: 'This registration was cancelled.', ticket };
  if (ticket.event_status === 'cancelled') return { ok: false, code: 'event_cancelled', message: 'The event has been cancelled.', ticket };
  if (ticket.checked_in_at) return { ok: false, code: 'already_used', message: `Ticket already used at ${new Date(ticket.checked_in_at).toLocaleString()}.`, ticket };
  return { ok: true, code: 'valid', message: 'Valid ticket.', ticket };
}

// Mark a ticket as checked in. The UPDATE only succeeds if checked_in_at is still NULL,
// so two concurrent requests cannot both record attendance.
const checkInTx = db.transaction((token, eventId) => {
  const result = verify(token, eventId);
  if (!result.ok) return result;
  const info = db.prepare(`UPDATE registrations SET checked_in_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                           WHERE id = ? AND checked_in_at IS NULL AND registration_status = 'confirmed'`).run(result.ticket.id);
  if (info.changes !== 1) {
    return { ok: false, code: 'already_used', message: 'Ticket was already used.', ticket: getTicketById(result.ticket.id) };
  }
  return { ok: true, code: 'checked_in', message: 'Checked in successfully.', ticket: getTicketById(result.ticket.id) };
});

function checkIn(token, eventId) {
  return checkInTx.immediate(token, eventId);
}

// Strip fields students should not see about other people (used in admin responses too).
function publicTicket(t) {
  if (!t) return t;
  const { user_id, student_email, ...rest } = t;
  return rest;
}

module.exports = { generateTicketToken, normalizeToken, register, cancel, listForUser, getTicketById,
  getTicketByToken, qrDataUrl, qrPngBuffer, verify, checkIn, publicTicket };
