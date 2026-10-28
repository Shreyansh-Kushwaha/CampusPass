'use strict';
// End-to-end workflow tests against a real server + temporary SQLite file.
// Run with: npm test
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = 4123;
const BASE = `http://localhost:${PORT}`;
const TMP_DB = path.join(__dirname, 'tmp-test.db');
for (const f of [TMP_DB, TMP_DB + '-wal', TMP_DB + '-shm']) if (fs.existsSync(f)) fs.unlinkSync(f);

let passed = 0, failed = 0;
function ok(cond, name, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
}

// Minimal cookie-jar client.
function client() {
  const jar = {};
  let csrf = null;
  async function req(method, url, body) {
    const headers = { Accept: 'application/json', Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (csrf && method !== 'GET') headers['X-CSRF-Token'] = csrf;
    const res = await fetch(BASE + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of setCookie) { const [kv] = c.split(';'); const [k, v] = kv.split('='); jar[k] = v; }
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : await res.text();
    if (data && data.csrfToken) csrf = data.csrfToken;
    return { status: res.status, data, headers: res.headers };
  }
  return { req, init: async () => { await req('GET', '/api/auth/session'); } };
}

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PORT: String(PORT), DB_PATH: TMP_DB, SESSION_SECRET: 'test-secret', ADMIN_EMAIL: 'admin@campuspass.edu', ADMIN_PASSWORD: 'Admin@12345' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; if (out.includes('running at')) resolve(child); });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (code) => { if (code) reject(new Error(`server exited ${code}: ${out}`)); });
    setTimeout(() => reject(new Error('server did not start: ' + out)), 8000);
  });
}
function stopServer(child) {
  return new Promise((resolve) => { child.on('exit', resolve); child.kill('SIGTERM'); });
}

(async () => {
  let server = await startServer();
  const admin = client(), stu1 = client(), stu2 = client(), stu3 = client(), anon = client();
  await Promise.all([admin.init(), stu1.init(), stu2.init(), stu3.init(), anon.init()]);
  const future = (days, h = 10) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return d.toISOString(); };

  console.log('\n1. Student registration and login');
  let r = await stu1.req('POST', '/api/auth/register', { full_name: 'Priya Sharma', email: 'priya@college.edu', password: 'Secret123!', confirm_password: 'Secret123!' });
  ok(r.status === 201 && r.data.user.role === 'student', 'student can register', JSON.stringify(r.data));
  r = await stu1.req('POST', '/api/auth/register', { full_name: 'Dup', email: 'PRIYA@college.edu', password: 'Secret123!' });
  ok(r.status === 409, 'duplicate email (case-insensitive) rejected');
  r = await anon.req('POST', '/api/auth/register', { full_name: 'X', email: 'bad', password: 'short' });
  ok(r.status === 400, 'invalid registration input rejected');
  await stu1.req('POST', '/api/auth/logout'); await stu1.init();
  r = await stu1.req('POST', '/api/auth/login', { email: 'priya@college.edu', password: 'wrong' });
  ok(r.status === 401, 'wrong password rejected');
  r = await stu1.req('POST', '/api/auth/login', { email: 'priya@college.edu', password: 'Secret123!' });
  ok(r.status === 200 && r.data.user.email === 'priya@college.edu', 'student can log in');
  r = await stu1.req('GET', '/api/auth/me');
  ok(r.status === 200 && !('password_hash' in r.data.user), 'session persists and hash not exposed');
  await stu2.req('POST', '/api/auth/register', { full_name: 'Arjun Mehta', email: 'arjun@college.edu', password: 'Secret123!' });
  await stu3.req('POST', '/api/auth/register', { full_name: 'Sara Khan', email: 'sara@college.edu', password: 'Secret123!' });

  console.log('\n2. Administrator login');
  r = await admin.req('POST', '/api/auth/login', { email: 'admin@campuspass.edu', password: 'Admin@12345' });
  ok(r.status === 200 && r.data.user.role === 'admin', 'admin can log in');
  r = await anon.req('POST', '/api/auth/login', { email: 'admin@campuspass.edu', password: 'Admin@12345' });
  // anon has CSRF from init; verify CSRF enforcement with a fresh client lacking the header
  const noCsrf = client(); await noCsrf.init();
  const resNo = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@campuspass.edu', password: 'Admin@12345' }) });
  ok(resNo.status === 403, 'state-changing request without CSRF token rejected');
  await anon.req('POST', '/api/auth/logout'); await anon.init();

  console.log('\n3. Event CRUD');
  r = await admin.req('POST', '/api/admin/events', { title: 'Test Workshop', description: 'A workshop created by the automated test suite.', category: 'Workshop', venue: 'Room 101', start_datetime: future(5), end_datetime: future(5, 12), registration_deadline: future(4), capacity: 2, status: 'published' });
  ok(r.status === 201 && r.data.event.id, 'admin can create event', JSON.stringify(r.data));
  const evId = r.data.event.id;
  r = await admin.req('POST', '/api/admin/events', { title: 'Bad', description: 'x', category: 'Nope', venue: '', start_datetime: future(5), end_datetime: future(4), registration_deadline: future(6), capacity: -3 });
  ok(r.status === 400, 'invalid event (bad dates/capacity) rejected');
  r = await admin.req('POST', '/api/admin/events', { title: 'Deadline bug', description: 'Deadline after start must fail.', category: 'Academic', venue: 'Hall', start_datetime: future(5), end_datetime: future(5, 12), registration_deadline: future(6), capacity: 10 });
  ok(r.status === 400, 'deadline after start rejected');
  r = await stu1.req('GET', `/api/events/${evId}`);
  ok(r.status === 200 && r.data.event.availability === 'open', 'event visible to students');
  r = await admin.req('PUT', `/api/admin/events/${evId}`, { title: 'Test Workshop (Edited)', description: 'A workshop created by the automated test suite.', category: 'Workshop', venue: 'Room 102', start_datetime: future(5), end_datetime: future(5, 12), registration_deadline: future(4), capacity: 2, status: 'published' });
  ok(r.status === 200 && r.data.event.venue === 'Room 102', 'admin can edit event');
  r = await admin.req('POST', '/api/admin/events', { title: 'Draft to delete', description: 'Temporary draft event for deletion.', category: 'Social', venue: 'Lawn', start_datetime: future(9), end_datetime: future(9, 12), registration_deadline: future(8), capacity: 10 });
  const delId = r.data.event.id;
  r = await stu1.req('GET', `/api/events/${delId}`);
  ok(r.status === 404, 'draft events hidden from students');
  r = await admin.req('DELETE', `/api/admin/events/${delId}`);
  ok(r.status === 200, 'event without registrations can be deleted');
  r = await admin.req('GET', `/api/admin/events/${delId}`);
  ok(r.status === 404, 'deleted event is gone');

  console.log('\n4. Search and filter');
  r = await anon.req('GET', '/api/events?q=Edited');
  ok(r.status === 200 && r.data.events.some((e) => e.id === evId), 'search by title works');
  r = await anon.req('GET', '/api/events?category=Workshop');
  ok(r.data.events.length > 0 && r.data.events.every((e) => e.category === 'Workshop'), 'category filter works');
  r = await anon.req('GET', '/api/events?category=Sports&q=HackSprint');
  ok(r.data.events.length === 0, 'combined filter returns no false positives');

  console.log('\n5-6. Event registration + QR generation');
  r = await anon.req('POST', '/api/registrations', { event_id: evId });
  ok(r.status === 401, 'anonymous cannot register');
  r = await stu1.req('POST', '/api/registrations', { event_id: evId });
  ok(r.status === 201 && r.data.ticket.ticket_token.startsWith('CP-'), 'student registers and gets ticket');
  const ticket1 = r.data.ticket;
  ok(typeof r.data.qr === 'string' && r.data.qr.startsWith('data:image/png;base64,'), 'QR code generated');
  ok(/^CP-([A-HJ-NP-Z2-9]{4}-){3}[A-HJ-NP-Z2-9]{4}$/.test(ticket1.ticket_token), 'token is random, formatted and contains no ids');
  r = await stu1.req('GET', `/api/registrations/${ticket1.id}/qr.png`);
  ok(r.status === 200 && (r.headers.get('content-type') || '').includes('image/png'), 'QR PNG download works');
  r = await stu2.req('GET', `/api/registrations/${ticket1.id}`);
  ok(r.status === 404, 'another student cannot view this ticket');

  console.log('\n7. Duplicate registration');
  r = await stu1.req('POST', '/api/registrations', { event_id: evId });
  ok(r.status === 409, 'duplicate registration rejected');

  console.log('\n8. Capacity enforcement (capacity 2)');
  r = await stu2.req('POST', '/api/registrations', { event_id: evId });
  ok(r.status === 201, 'second student fills the event');
  r = await stu3.req('POST', '/api/registrations', { event_id: evId });
  ok(r.status === 409 && /full/i.test(r.data.error), 'third student rejected: event full');
  r = await anon.req('GET', `/api/events/${evId}`);
  ok(r.data.event.availability === 'full' && r.data.event.seats_left === 0, 'availability reflects full');
  // Concurrency: create event with capacity 1 and fire 3 simultaneous registrations.
  r = await admin.req('POST', '/api/admin/events', { title: 'Race Event', description: 'Capacity one, many takers.', category: 'Social', venue: 'Lawn', start_datetime: future(6), end_datetime: future(6, 12), registration_deadline: future(5), capacity: 1, status: 'published' });
  const raceId = r.data.event.id;
  const results = await Promise.all([stu1, stu2, stu3].map((c) => c.req('POST', '/api/registrations', { event_id: raceId })));
  ok(results.filter((x) => x.status === 201).length === 1, 'concurrent registrations: exactly one succeeds', results.map((x) => x.status).join(','));
  // Cancel and re-register updates capacity
  const raceWinner = results.findIndex((x) => x.status === 201);
  const winnerClient = [stu1, stu2, stu3][raceWinner];
  r = await winnerClient.req('DELETE', `/api/registrations/${results[raceWinner].data.ticket.id}`);
  ok(r.status === 200 && r.data.ticket.registration_status === 'cancelled', 'student can cancel registration');
  r = await anon.req('GET', `/api/events/${raceId}`);
  ok(r.data.event.seats_left === 1, 'seat released after cancellation');
  // Deadline enforcement
  r = await admin.req('POST', '/api/admin/events', { title: 'Past Deadline', description: 'Deadline already passed for this one.', category: 'Academic', venue: 'Hall', start_datetime: future(3), end_datetime: future(3, 12), registration_deadline: new Date(Date.now() - 3600e3).toISOString(), capacity: 10, status: 'published' });
  r = await stu3.req('POST', '/api/registrations', { event_id: r.data.event.id });
  ok(r.status === 400 && /closed/i.test(r.data.error), 'registration after deadline rejected');
  r = await admin.req('PATCH', `/api/admin/events/${raceId}/status`, { status: 'closed' });
  r = await stu3.req('POST', '/api/registrations', { event_id: raceId });
  ok(r.status === 400, 'registration on closed event rejected');
  r = await admin.req('DELETE', `/api/admin/events/${evId}`);
  ok(r.status === 409, 'event with registrations cannot be hard-deleted');
  r = await admin.req('PATCH', `/api/admin/events/${evId}/status`, { status: 'cancelled' });
  ok(r.status === 200 && r.data.event.status === 'cancelled', 'event can be cancelled instead');
  await admin.req('PATCH', `/api/admin/events/${evId}/status`, { status: 'published' }); // restore for check-in tests

  console.log('\n9-11. Ticket verification and check-in');
  r = await admin.req('POST', '/api/admin/checkin/verify', { token: ticket1.ticket_token, event_id: evId });
  ok(r.status === 200 && r.data.ok && r.data.ticket.student_name === 'Priya Sharma', 'valid ticket verified');
  r = await admin.req('POST', '/api/admin/checkin/verify', { token: ticket1.ticket_token.toLowerCase().replace(/-/g, ''), event_id: evId });
  ok(r.status === 200 && r.data.ok, 'token normalisation (lowercase, no dashes) works');
  r = await admin.req('POST', '/api/admin/checkin/verify', { token: ticket1.ticket_token, event_id: raceId });
  ok(r.status === 422 && r.data.code === 'wrong_event', 'ticket for another event rejected');
  r = await admin.req('POST', '/api/admin/checkin', { token: 'CP-AAAA-BBBB-CCCC-DDDD', event_id: evId });
  ok(r.status === 422 && r.data.code === 'invalid', 'invalid ticket rejected');
  r = await admin.req('POST', '/api/admin/checkin', { token: ticket1.ticket_token, event_id: evId });
  ok(r.status === 200 && r.data.code === 'checked_in' && r.data.ticket.checked_in_at, 'valid ticket checked in');
  r = await admin.req('POST', '/api/admin/checkin', { token: ticket1.ticket_token, event_id: evId });
  ok(r.status === 422 && r.data.code === 'already_used', 'duplicate check-in rejected');
  // Simultaneous duplicate check-in on a fresh ticket
  r = await stu2.req('GET', '/api/registrations');
  const t2 = r.data.registrations.find((x) => x.event_id === evId);
  const dup = await Promise.all([1, 2, 3].map(() => admin.req('POST', '/api/admin/checkin', { token: t2.ticket_token, event_id: evId })));
  ok(dup.filter((x) => x.status === 200).length === 1, 'concurrent duplicate check-ins: exactly one succeeds', dup.map((x) => x.status).join(','));
  r = await admin.req('GET', `/api/admin/events/${evId}/attendees`);
  ok(r.data.total === 2 && r.data.event.checked_in_count === 2, 'attendee list and counts correct');
  r = await admin.req('GET', `/api/admin/events/${evId}/attendees?q=priya`);
  ok(r.data.total === 1, 'attendee search works');
  r = await admin.req('GET', `/api/admin/events/${evId}/attendees.csv`);
  ok(r.status === 200 && String(r.data).includes('priya@college.edu'), 'CSV export works');
  r = await admin.req('GET', '/api/admin/stats');
  ok(r.data.total_checked_in === 2 && r.data.total_registrations >= 2 && r.data.attendance_rate > 0, 'dashboard stats computed from SQL');

  console.log('\n12. Student denied admin routes');
  r = await stu1.req('GET', '/api/admin/stats');
  ok(r.status === 403, 'student GET admin stats -> 403');
  r = await stu1.req('POST', '/api/admin/events', { title: 'Hack' });
  ok(r.status === 403, 'student POST admin events -> 403');
  r = await stu1.req('POST', '/api/admin/checkin', { token: 'x', event_id: 1 });
  ok(r.status === 403, 'student check-in -> 403');
  r = await anon.req('GET', '/api/admin/stats');
  ok(r.status === 401, 'anonymous admin route -> 401');

  console.log('\n13. Persistence across restart');
  await stopServer(server);
  server = await startServer();
  r = await stu1.req('GET', '/api/auth/me');
  ok(r.status === 200 && r.data.user.email === 'priya@college.edu', 'session survives restart');
  r = await stu1.req('GET', '/api/registrations');
  ok(r.data.registrations.some((x) => x.ticket_token === ticket1.ticket_token && x.checked_in_at), 'registration + check-in persisted');
  r = await anon.req('GET', '/api/events?scope=all&limit=100');
  const total = r.data.total;
  ok(total >= 7, 'events persisted');
  await stopServer(server);
  server = await startServer();
  r = await anon.req('GET', '/api/events?scope=all&limit=100');
  ok(r.data.total === total, 'seed is idempotent (no duplicate sample events)');

  console.log('\nStatic pages');
  for (const p of ['/', '/events', '/event?id=1', '/login', '/register', '/student-dashboard', '/ticket', '/admin-dashboard', '/admin-events', '/admin-attendees', '/admin-checkin', '/css/styles.css', '/js/app.js', '/vendor/jsQR.js']) {
    const res = await fetch(BASE + p); ok(res.status === 200, `GET ${p}`);
  }
  const nf = await fetch(BASE + '/does-not-exist'); ok(nf.status === 404, '404 page served');

  await stopServer(server);
  for (const f of [TMP_DB, TMP_DB + '-wal', TMP_DB + '-shm']) if (fs.existsSync(f)) fs.unlinkSync(f);
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
