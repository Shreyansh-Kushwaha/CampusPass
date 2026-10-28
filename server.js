'use strict';
require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');

const SqliteSessionStore = require('./database/sessionStore');
const seed = require('./database/seed');
const { ensureCsrfToken, verifyCsrf } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'change-me-to-a-long-random-string') {
  if (IS_PROD) {
    console.error('SESSION_SECRET must be set to a strong random value in production.');
    process.exit(1);
  }
  console.warn('[warn] Using a development SESSION_SECRET. Copy .env.example to .env and set a real secret.');
}

seed();

const app = express();
app.disable('x-powered-by');
if (IS_PROD) app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      mediaSrc: ["'self'", 'blob:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

app.use(session({
  name: 'campuspass.sid',
  store: new SqliteSessionStore(),
  secret: process.env.SESSION_SECRET || 'campuspass-dev-secret-not-for-production',
  resave: false,
  saveUninitialized: true, // needed so anonymous visitors get a CSRF token before logging in
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD, // Secure cookies require HTTPS; disabled for local development over http://localhost
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
}));
app.use(ensureCsrfToken);

// API
app.use('/api', verifyCsrf);
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/events', require('./routes/eventRoutes'));
app.use('/api/registrations', require('./routes/registrationRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

// Serve the QR scanning library from node_modules so no CDN is required.
app.get('/vendor/jsQR.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'node_modules', 'jsqr', 'dist', 'jsQR.js'));
});

// Static frontend
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: IS_PROD ? '1h' : 0 }));

app.use(notFound);
app.use(errorHandler);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`CampusPass running at http://localhost:${PORT}`);
  });
}

module.exports = app;
