'use strict';
const crypto = require('crypto');
const { HttpError } = require('./errorHandler');

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return next(new HttpError(401, 'Please log in to continue.'));
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return next(new HttpError(401, 'Please log in to continue.'));
  }
  if (req.session.user.role !== 'admin') {
    return next(new HttpError(403, 'Administrator access is required.'));
  }
  next();
}

// Ensure every session has a CSRF token; the client reads it from /api/auth/session
// (or /api/auth/csrf) and sends it back in the X-CSRF-Token header.
function ensureCsrfToken(req, res, next) {
  if (req.session && !req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  next();
}

function verifyCsrf(req, res, next) {
  const safe = ['GET', 'HEAD', 'OPTIONS'];
  if (safe.includes(req.method)) return next();
  const header = req.get('X-CSRF-Token');
  const expected = req.session && req.session.csrfToken;
  if (!header || !expected || header.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected))) {
    return next(new HttpError(403, 'Invalid or missing CSRF token. Please refresh the page and try again.'));
  }
  next();
}

module.exports = { requireAuth, requireAdmin, ensureCsrfToken, verifyCsrf };
