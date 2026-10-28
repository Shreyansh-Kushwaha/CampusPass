'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../database/db');
const { HttpError } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { str, validateEmail, validatePassword } = require('../services/validators');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many accounts created from this device. Please try again later.' },
});

function sessionUser(u) {
  return { id: u.id, full_name: u.full_name, email: u.email, role: u.role };
}

// Regenerate the session on login to prevent session fixation.
function startSession(req, user) {
  return new Promise((resolve, reject) => {
    const csrfToken = req.session.csrfToken;
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.user = sessionUser(user);
      req.session.csrfToken = csrfToken;
      req.session.save((e) => (e ? reject(e) : resolve()));
    });
  });
}

router.get('/session', (req, res) => {
  res.json({ user: req.session.user || null, csrfToken: req.session.csrfToken });
});

router.get('/csrf', (req, res) => res.json({ csrfToken: req.session.csrfToken }));

router.post('/register', registerLimiter, async (req, res, next) => {
  try {
    const full_name = str(req.body.full_name, { field: 'Full name', min: 2, max: 80 });
    const email = validateEmail(req.body.email);
    const password = validatePassword(req.body.password);
    if (req.body.confirm_password !== undefined && req.body.confirm_password !== password) {
      throw new HttpError(400, 'Passwords do not match.');
    }
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (exists) throw new HttpError(409, 'An account with this email already exists.');

    const hash = await bcrypt.hash(password, 10);
    // Role is always 'student' here; admins are only seeded or promoted directly in the database.
    const info = db.prepare("INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'student')")
      .run(full_name, email, hash);
    const user = db.prepare('SELECT id, full_name, email, role FROM users WHERE id = ?').get(info.lastInsertRowid);
    await startSession(req, user);
    res.status(201).json({ user: req.session.user, csrfToken: req.session.csrfToken });
  } catch (err) {
    if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') return next(new HttpError(409, 'An account with this email already exists.'));
    next(err);
  }
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const email = validateEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!ok) throw new HttpError(401, 'Incorrect email or password.');
    await startSession(req, user);
    res.json({ user: req.session.user, csrfToken: req.session.csrfToken });
  } catch (err) { next(err); }
});

router.post('/logout', (req, res, next) => {
  // Regenerate instead of destroy so the client immediately gets a fresh anonymous session + CSRF token.
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.csrfToken = require('crypto').randomBytes(24).toString('hex');
    res.json({ ok: true, csrfToken: req.session.csrfToken });
  });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, full_name, email, role, created_at FROM users WHERE id = ?').get(req.session.user.id);
  res.json({ user });
});

module.exports = router;
