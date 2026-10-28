'use strict';
const db = require('../database/db');
const { HttpError } = require('../middleware/errorHandler');

// Columns shared by every event query, including a live count of confirmed registrations.
const EVENT_SELECT = `
  SELECT e.*,
         (SELECT COUNT(*) FROM registrations r
           WHERE r.event_id = e.id AND r.registration_status = 'confirmed') AS registered_count,
         (SELECT COUNT(*) FROM registrations r
           WHERE r.event_id = e.id AND r.registration_status = 'confirmed' AND r.checked_in_at IS NOT NULL) AS checked_in_count
  FROM events e
`;

// Derive the student-facing availability state from status, dates and capacity.
function decorate(event, now = new Date()) {
  if (!event) return event;
  const nowIso = now.toISOString();
  const seatsLeft = Math.max(0, event.capacity - event.registered_count);
  let availability;
  if (event.status === 'cancelled') availability = 'cancelled';
  else if (event.status === 'draft') availability = 'draft';
  else if (event.end_datetime < nowIso) availability = 'ended';
  else if (event.status === 'closed') availability = 'closed';
  else if (event.registration_deadline < nowIso) availability = 'closed';
  else if (seatsLeft === 0) availability = 'full';
  else availability = 'open';
  return { ...event, seats_left: seatsLeft, availability };
}

function listPublic({ q = '', category = '', scope = 'upcoming', limit = 50, offset = 0 } = {}) {
  const where = ["e.status IN ('published', 'closed', 'cancelled')"];
  const params = {};
  if (scope === 'upcoming') { where.push('e.end_datetime >= @now'); params.now = new Date().toISOString(); }
  if (scope === 'past') { where.push('e.end_datetime < @now'); params.now = new Date().toISOString(); }
  if (q) { where.push('(e.title LIKE @q OR e.description LIKE @q)'); params.q = `%${q}%`; }
  if (category) { where.push('e.category = @category'); params.category = category; }
  params.limit = limit; params.offset = offset;

  const rows = db.prepare(`${EVENT_SELECT} WHERE ${where.join(' AND ')}
    ORDER BY e.start_datetime ${scope === 'past' ? 'DESC' : 'ASC'} LIMIT @limit OFFSET @offset`).all(params);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM events e WHERE ${where.join(' AND ')}`).get(params).n;
  return { events: rows.map((r) => decorate(r)), total };
}

function listAll({ q = '', status = '', limit = 100, offset = 0 } = {}) {
  const where = ['1=1'];
  const params = { limit, offset };
  if (q) { where.push('(e.title LIKE @q OR e.venue LIKE @q)'); params.q = `%${q}%`; }
  if (status) { where.push('e.status = @status'); params.status = status; }
  const rows = db.prepare(`${EVENT_SELECT} WHERE ${where.join(' AND ')} ORDER BY e.start_datetime DESC LIMIT @limit OFFSET @offset`).all(params);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM events e WHERE ${where.join(' AND ')}`).get(params).n;
  return { events: rows.map((r) => decorate(r)), total };
}

function getById(id, { includeDraft = false } = {}) {
  const row = db.prepare(`${EVENT_SELECT} WHERE e.id = ?`).get(id);
  if (!row) throw new HttpError(404, 'Event not found.');
  if (row.status === 'draft' && !includeDraft) throw new HttpError(404, 'Event not found.');
  return decorate(row);
}

function create(data) {
  const info = db.prepare(`
    INSERT INTO events (title, description, category, venue, start_datetime, end_datetime, registration_deadline, capacity, status)
    VALUES (@title, @description, @category, @venue, @start_datetime, @end_datetime, @registration_deadline, @capacity, @status)
  `).run(data);
  return getById(info.lastInsertRowid, { includeDraft: true });
}

function update(id, data) {
  const existing = getById(id, { includeDraft: true });
  if (data.capacity < existing.registered_count) {
    throw new HttpError(400, `Capacity cannot be lower than the ${existing.registered_count} students already registered.`);
  }
  db.prepare(`
    UPDATE events SET title=@title, description=@description, category=@category, venue=@venue,
      start_datetime=@start_datetime, end_datetime=@end_datetime, registration_deadline=@registration_deadline,
      capacity=@capacity, status=@status WHERE id=@id
  `).run({ ...data, id });
  return getById(id, { includeDraft: true });
}

function setStatus(id, status) {
  if (!['draft', 'published', 'closed', 'cancelled'].includes(status)) throw new HttpError(400, 'Invalid status.');
  getById(id, { includeDraft: true });
  db.prepare('UPDATE events SET status = ? WHERE id = ?').run(status, id);
  return getById(id, { includeDraft: true });
}

// Hard delete only when no registrations exist; otherwise the event must be cancelled instead.
function remove(id) {
  const event = getById(id, { includeDraft: true });
  const regs = db.prepare('SELECT COUNT(*) AS n FROM registrations WHERE event_id = ?').get(id).n;
  if (regs > 0) {
    throw new HttpError(409, `This event has ${regs} registration(s) and cannot be deleted. Cancel it instead to keep attendee records.`);
  }
  db.prepare('DELETE FROM events WHERE id = ?').run(id);
  return event;
}

function stats() {
  const now = new Date().toISOString();
  const row = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM events) AS total_events,
      (SELECT COUNT(*) FROM events WHERE status = 'published' AND start_datetime >= @now) AS upcoming_events,
      (SELECT COUNT(*) FROM registrations WHERE registration_status = 'confirmed') AS total_registrations,
      (SELECT COUNT(*) FROM registrations WHERE registration_status = 'confirmed' AND checked_in_at IS NOT NULL) AS total_checked_in,
      (SELECT COUNT(*) FROM users WHERE role = 'student') AS total_students
  `).get({ now });
  row.attendance_rate = row.total_registrations ? Math.round((row.total_checked_in / row.total_registrations) * 100) : 0;

  row.by_category = db.prepare(`
    SELECT e.category, COUNT(r.id) AS registrations
    FROM events e LEFT JOIN registrations r ON r.event_id = e.id AND r.registration_status = 'confirmed'
    GROUP BY e.category ORDER BY registrations DESC, e.category
  `).all();

  row.top_events = db.prepare(`${EVENT_SELECT} WHERE e.status != 'draft' ORDER BY registered_count DESC, e.start_datetime ASC LIMIT 5`)
    .all().map((r) => decorate(r));

  row.recent_registrations = db.prepare(`
    SELECT r.registered_at, r.checked_in_at, u.full_name, e.title AS event_title, e.id AS event_id
    FROM registrations r JOIN users u ON u.id = r.user_id JOIN events e ON e.id = r.event_id
    WHERE r.registration_status = 'confirmed' ORDER BY r.registered_at DESC LIMIT 8
  `).all();
  return row;
}

function attendees(eventId, { q = '', status = '', limit = 50, offset = 0 } = {}) {
  getById(eventId, { includeDraft: true });
  const where = ['r.event_id = @eventId'];
  const params = { eventId, limit, offset };
  if (q) { where.push('(u.full_name LIKE @q OR u.email LIKE @q OR r.ticket_token LIKE @q)'); params.q = `%${q}%`; }
  if (status === 'checked_in') where.push("r.registration_status = 'confirmed' AND r.checked_in_at IS NOT NULL");
  if (status === 'not_checked_in') where.push("r.registration_status = 'confirmed' AND r.checked_in_at IS NULL");
  if (status === 'cancelled') where.push("r.registration_status = 'cancelled'");
  if (status === 'confirmed') where.push("r.registration_status = 'confirmed'");

  const base = `FROM registrations r JOIN users u ON u.id = r.user_id WHERE ${where.join(' AND ')}`;
  const rows = db.prepare(`
    SELECT r.id, r.ticket_token, r.registration_status, r.registered_at, r.checked_in_at, u.full_name, u.email
    ${base} ORDER BY r.registered_at DESC LIMIT @limit OFFSET @offset`).all(params);
  const total = db.prepare(`SELECT COUNT(*) AS n ${base}`).get(params).n;
  return { attendees: rows, total };
}

module.exports = { listPublic, listAll, getById, create, update, setStatus, remove, stats, attendees, decorate };
