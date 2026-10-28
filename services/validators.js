'use strict';
const { HttpError } = require('../middleware/errorHandler');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CATEGORIES = ['Academic', 'Cultural', 'Technical', 'Sports', 'Workshop', 'Social'];

function str(v, { field, min = 0, max = 1000, required = true } = {}) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw new HttpError(400, `${field} must be text.`);
  v = v.trim();
  if (required && v.length < Math.max(min, 1)) throw new HttpError(400, `${field} is required.`);
  if (v.length < min) throw new HttpError(400, `${field} must be at least ${min} characters.`);
  if (v.length > max) throw new HttpError(400, `${field} must be at most ${max} characters.`);
  return v;
}

function validateEmail(v) {
  const email = str(v, { field: 'Email', max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address.');
  return email;
}

function validatePassword(v) {
  if (typeof v !== 'string' || v.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  if (v.length > 128) throw new HttpError(400, 'Password is too long.');
  return v;
}

function parseDate(v, field) {
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `${field} is required.`);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `${field} is not a valid date.`);
  return d;
}

function validateEvent(body) {
  const title = str(body.title, { field: 'Title', min: 3, max: 120 });
  const description = str(body.description, { field: 'Description', min: 10, max: 4000 });
  const category = str(body.category, { field: 'Category', max: 40 });
  if (!CATEGORIES.includes(category)) throw new HttpError(400, `Category must be one of: ${CATEGORIES.join(', ')}.`);
  const venue = str(body.venue, { field: 'Venue', min: 2, max: 120 });

  const start = parseDate(body.start_datetime, 'Start date');
  const end = parseDate(body.end_datetime, 'End date');
  const deadline = parseDate(body.registration_deadline, 'Registration deadline');
  if (end <= start) throw new HttpError(400, 'End date must be after the start date.');
  if (deadline > start) throw new HttpError(400, 'Registration deadline must be on or before the event start.');

  const capacity = Number(body.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000) {
    throw new HttpError(400, 'Capacity must be a whole number between 1 and 100000.');
  }

  const status = body.status === undefined ? 'draft' : String(body.status);
  if (!['draft', 'published', 'closed', 'cancelled'].includes(status)) {
    throw new HttpError(400, 'Invalid event status.');
  }

  return {
    title, description, category, venue,
    start_datetime: start.toISOString(),
    end_datetime: end.toISOString(),
    registration_deadline: deadline.toISOString(),
    capacity, status,
  };
}

function toInt(v, field = 'id') {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, `Invalid ${field}.`);
  return n;
}

module.exports = { str, validateEmail, validatePassword, validateEvent, toInt, CATEGORIES };
