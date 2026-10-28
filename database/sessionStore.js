'use strict';
// Minimal persistent session store for express-session backed by better-sqlite3.
// Sessions survive server restarts and expired rows are pruned periodically.
const { Store } = require('express-session');
const db = require('./db');

const stmts = {
  get: db.prepare('SELECT sess FROM sessions WHERE sid = ? AND expires > ?'),
  set: db.prepare('INSERT OR REPLACE INTO sessions (sid, sess, expires) VALUES (?, ?, ?)'),
  destroy: db.prepare('DELETE FROM sessions WHERE sid = ?'),
  touch: db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?'),
  prune: db.prepare('DELETE FROM sessions WHERE expires <= ?'),
};

class SqliteSessionStore extends Store {
  constructor(options = {}) {
    super();
    this.ttl = options.ttl || 1000 * 60 * 60 * 24 * 7; // 7 days
    this.timer = setInterval(() => stmts.prune.run(Date.now()), 1000 * 60 * 15);
    if (this.timer.unref) this.timer.unref();
  }

  expiresAt(sess) {
    if (sess && sess.cookie && sess.cookie.expires) {
      const t = new Date(sess.cookie.expires).getTime();
      if (!Number.isNaN(t)) return t;
    }
    return Date.now() + this.ttl;
  }

  get(sid, cb) {
    try {
      const row = stmts.get.get(sid, Date.now());
      cb(null, row ? JSON.parse(row.sess) : null);
    } catch (err) { cb(err); }
  }

  set(sid, sess, cb) {
    try {
      stmts.set.run(sid, JSON.stringify(sess), this.expiresAt(sess));
      cb && cb(null);
    } catch (err) { cb && cb(err); }
  }

  destroy(sid, cb) {
    try { stmts.destroy.run(sid); cb && cb(null); } catch (err) { cb && cb(err); }
  }

  touch(sid, sess, cb) {
    try { stmts.touch.run(this.expiresAt(sess), sid); cb && cb(null); } catch (err) { cb && cb(err); }
  }
}

module.exports = SqliteSessionStore;
