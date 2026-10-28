# CampusPass — College Event Management & Ticketing System

CampusPass is a lightweight web application where students discover college events, register for them, receive QR-code tickets, and have their attendance verified at the door. Administrators manage events, view attendees, scan tickets and track attendance.

**Stack:** Node.js · Express 5 · SQLite (`better-sqlite3`) · HTML5 / CSS3 / vanilla JavaScript. No database server, no Docker, no frontend framework, no paid APIs.

---

## Quick start

Requirements: **Node.js 18+** and npm. Nothing else.

```bash
npm install
cp .env.example .env     # optional, but recommended: set a real SESSION_SECRET
npm start                # or: npm run dev  (auto-restarts on file changes)
```

Open **http://localhost:3000**.

On first launch the app automatically:

- creates `data/campuspass.db` (and the `data/` folder),
- creates all tables,
- seeds **7 realistic sample events**,
- seeds the **demo administrator** account.

Restarting never deletes or duplicates data. Seeding only runs when the admin or events are missing.

### Demo credentials

| Role  | Email                    | Password      |
|-------|--------------------------|---------------|
| Admin | `admin@campuspass.edu`   | `Admin@12345` |

Student accounts are created through **Create account** on the site. Students can never make themselves admins through the public form; the admin role is only ever assigned by the seeder (or directly in the database).

Change the demo admin credentials via `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env` **before** the first launch (the seeder only runs if no admin exists).

### Run the tests

```bash
npm test
```

This starts the server on a temporary database (`tests/tmp-test.db`), runs ~70 end-to-end checks across all 13 required workflows (auth, CRUD, search, registration, QR generation, duplicates, capacity races, check-in, duplicate check-in races, role denial, persistence across restart, idempotent seeding) and deletes the temporary database afterwards.

---

## Features

### Students
- Landing page with hero, featured events, live search and category filters.
- Full event listing (upcoming / past) with availability state: **Open · Full · Closed · Cancelled · Ended**.
- Event detail page with venue, dates, deadline, capacity and a live seat bar.
- Account registration and login (bcrypt-hashed passwords, unique emails, server-side validation).
- One-click free registration with server-enforced capacity, deadline, duplicate and status checks.
- Premium "invitation style" digital ticket with QR code, downloadable PNG and print layout.
- Personal dashboard: totals, upcoming tickets, attended/missed/cancelled history, cancellation.

### Administrators
- Dashboard with real SQL-computed stats: total/upcoming events, registrations, check-ins, attendance %, registrations by category, recent activity, most popular events.
- Event CRUD: create, edit, publish, close registration, cancel, delete (delete is blocked when registrations exist — cancel instead).
- Attendee management per event: search, filter by status, pagination, registered vs checked-in counts, CSV export.
- Check-in page: camera QR scanning (jsQR, served locally) **and** manual code entry; verify-only or check-in; session log.

### Security
- `helmet` security headers + Content-Security-Policy (scripts only from same origin).
- Session cookies: `httpOnly`, `sameSite=lax`, `secure` in production; sessions persisted in SQLite and regenerated on login.
- CSRF protection: per-session token required in the `X-CSRF-Token` header for every non-GET `/api` request.
- Login & registration rate limiting (`express-rate-limit`).
- Role-based access control enforced server-side on every protected route.
- Parameterized SQL everywhere; no stack traces, hashes or internal errors leak to clients.
- Ticket tokens: 16 characters from `crypto.randomBytes` (~80 bits), formatted `CP-XXXX-XXXX-XXXX-XXXX`. The QR code contains **only** this token — no IDs, names or emails.
- All HTML is rendered through DOM APIs / escaped text, never via unescaped `innerHTML` of user data.

### Concurrency & integrity
- Registration runs in an `IMMEDIATE` SQLite transaction: capacity is re-checked inside the write lock, so simultaneous requests can never oversell. `UNIQUE(user_id, event_id)` is the second line of defence.
- Check-in uses `UPDATE … WHERE checked_in_at IS NULL` inside a transaction; exactly one of N concurrent scans succeeds.
- `PRAGMA foreign_keys = ON`; registrations use `ON DELETE RESTRICT` for events so events with attendees can only be cancelled, never destroyed.

---

## Project structure

```
server.js                     Express app, security middleware, routing
package.json
.env.example                  Configuration template
database/
  db.js                       better-sqlite3 connection, pragmas, schema bootstrap
  schema.sql                  Tables, constraints, indexes
  seed.js                     Idempotent admin + sample event seeding
  sessionStore.js             express-session store backed by SQLite
middleware/
  auth.js                     requireAuth, requireAdmin, CSRF
  errorHandler.js             HttpError + safe JSON error responses
routes/
  authRoutes.js               register / login / logout / session
  eventRoutes.js              public event listing, search, detail
  registrationRoutes.js       register, tickets, QR PNG, cancel
  adminRoutes.js              stats, event CRUD, attendees, CSV, check-in
services/
  eventService.js             event queries, availability logic, stats
  ticketService.js            token generation, transactional register/check-in, QR
  validators.js               input validation
public/
  *.html                      pages (index, events, event, login, register,
                              student-dashboard, ticket, admin-*, 404)
  css/styles.css              editorial design system
  js/                         one small vanilla-JS module per page + app.js shared
tests/run.js                  end-to-end workflow tests
data/campuspass.db            created automatically (git-ignored)
```

## API overview

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/api/events?q=&category=&scope=upcoming|past|all&page=` | public | list/search events |
| GET | `/api/events/:id` | public | event details + availability |
| POST | `/api/auth/register` · `/login` · `/logout` | public | authentication |
| GET | `/api/auth/session` | public | current user + CSRF token |
| GET/POST | `/api/registrations` | student | my tickets / register for event |
| GET | `/api/registrations/:id` · `/:id/qr.png` | owner | ticket JSON with QR, PNG download |
| DELETE | `/api/registrations/:id` | owner | cancel registration |
| GET | `/api/admin/stats` | admin | dashboard statistics |
| GET/POST/PUT/DELETE | `/api/admin/events[/:id]` | admin | event CRUD |
| PATCH | `/api/admin/events/:id/status` | admin | publish / close / cancel |
| GET | `/api/admin/events/:id/attendees[.csv]` | admin | attendee list / export |
| POST | `/api/admin/checkin/verify` · `/api/admin/checkin` | admin | validate / record attendance |

---

## Configuration (`.env`)

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3000` | |
| `SESSION_SECRET` | dev fallback | **Required** in production; app refuses to start without it. |
| `NODE_ENV` | `development` | `production` turns on `Secure` cookies (HTTPS only) and `trust proxy`. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | demo values | Used only when seeding the first admin. |
| `DB_PATH` | `data/campuspass.db` | Override the database file location. |

**Development vs production cookies:** locally the session cookie is sent over plain `http://localhost`, so `secure` is off. In production set `NODE_ENV=production` and serve over HTTPS (or behind a TLS-terminating proxy), which turns `secure` on.

**Database file and Git:** `data/*.db` is git-ignored because it contains user accounts and password hashes. Back it up by copying `data/campuspass.db` while the server is stopped (or copy `.db`, `.db-wal` and `.db-shm` together).

---

## Troubleshooting

- **`npm install` fails building `better-sqlite3`** — prebuilt binaries exist for all current Node LTS versions. If you are on an unusual platform, install build tools (`python3`, `make`, `g++`) and retry.
- **"Invalid or missing CSRF token"** — the page session expired or cookies are blocked. Reload the page; make sure cookies are enabled for `localhost`.
- **Camera does not start on the check-in page** — browsers only expose the camera on `https://` or `http://localhost`. On a phone over LAN, use the manual code entry or run behind HTTPS.
- **Fonts look different** — Google Fonts are loaded for Cormorant Garamond / DM Sans / Allura; offline, the app falls back to system serif/sans fonts and remains fully functional.
- **"Too many login attempts"** — the limiter allows 10 attempts per 15 minutes per IP. Wait or restart the server.
- **Reset everything** — stop the server and delete `data/campuspass.db*`. The next start recreates and reseeds the database.
- **Port in use** — set a different `PORT` in `.env`.
