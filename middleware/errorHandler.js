'use strict';

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function notFound(req, res, next) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found.' });
  }
  res.status(404).sendFile('404.html', { root: 'public' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    const body = { error: err.message };
    if (err.details) body.details = err.details;
    return res.status(err.status).json(body);
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed request body.' });
  }
  if (err && err.code && String(err.code).startsWith('SQLITE_CONSTRAINT')) {
    return res.status(409).json({ error: 'That action conflicts with existing data.' });
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
}

module.exports = { HttpError, notFound, errorHandler };
