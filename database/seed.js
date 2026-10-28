'use strict';
// Idempotent seeding: runs on every startup but only inserts when data is missing.
const bcrypt = require('bcryptjs');
const db = require('./db');

function iso(date) { return date.toISOString(); }
function daysFromNow(days, hour = 10, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function seedAdmin() {
  const existing = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (existing) return;
  const email = (process.env.ADMIN_EMAIL || 'admin@campuspass.edu').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Admin@12345';
  const name = process.env.ADMIN_NAME || 'Campus Administrator';
  db.prepare('INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name, email, bcrypt.hashSync(password, 10), 'admin');
  console.log(`[seed] Demo admin created: ${email}`);
}

function seedEvents() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
  if (count > 0) return;

  const samples = [
    {
      title: 'Annual Cultural Night: Lumière',
      description: 'An evening of music, dance, and theatre curated by the Fine Arts Society. Twelve student ensembles take the stage in the open-air amphitheatre, followed by a lantern walk through the old quadrangle.',
      category: 'Cultural', venue: 'Open-Air Amphitheatre',
      start: daysFromNow(12, 18, 30), end: daysFromNow(12, 22, 0), deadline: daysFromNow(11, 23, 59), capacity: 400,
    },
    {
      title: 'HackSprint 2026: 24-Hour Build',
      description: 'The Computer Science Association hosts its flagship hackathon. Form teams of up to four, pick one of three real-world problem statements, and ship a working prototype in 24 hours. Mentors from alumni startups on site.',
      category: 'Technical', venue: 'Innovation Lab, Block C',
      start: daysFromNow(20, 9, 0), end: daysFromNow(21, 9, 0), deadline: daysFromNow(17, 18, 0), capacity: 120,
    },
    {
      title: 'Guest Lecture: The Mathematics of Elections',
      description: 'Visiting Professor Anita Rao explores voting systems, fairness theorems, and why no electoral method is perfect. Open to all departments, with a Q&A session to follow.',
      category: 'Academic', venue: 'Seminar Hall 2',
      start: daysFromNow(5, 14, 0), end: daysFromNow(5, 16, 0), deadline: daysFromNow(4, 20, 0), capacity: 150,
    },
    {
      title: 'Inter-Department Football Finals',
      description: 'The season culminates on the main ground. Engineering faces Commerce for the Chancellor\'s Cup. Registration covers the spectator stand; players are registered through their department captains.',
      category: 'Sports', venue: 'Main Sports Ground',
      start: daysFromNow(8, 16, 30), end: daysFromNow(8, 19, 0), deadline: daysFromNow(8, 12, 0), capacity: 600,
    },
    {
      title: 'Résumé & Interview Clinic',
      description: 'A hands-on workshop by the Placement Cell. Bring a printed résumé, receive one-on-one feedback, and practise a timed mock interview with industry volunteers. Limited seats to keep sessions personal.',
      category: 'Workshop', venue: 'Placement Cell, Admin Block',
      start: daysFromNow(3, 10, 0), end: daysFromNow(3, 13, 0), deadline: daysFromNow(2, 17, 0), capacity: 40,
    },
    {
      title: 'Spring Literature Festival',
      description: 'Three days of readings, panel discussions, and a poetry slam. This year\'s theme is "Letters Home". Student publications will launch their annual anthology on the closing evening.',
      category: 'Cultural', venue: 'Central Library Courtyard',
      start: daysFromNow(30, 11, 0), end: daysFromNow(32, 20, 0), deadline: daysFromNow(28, 23, 59), capacity: 250,
    },
    {
      title: 'Robotics Showcase & Demo Day',
      description: 'Final-year robotics teams demonstrate autonomous rovers, robotic arms, and drone navigation. Visitors can vote for the People\'s Choice award.',
      category: 'Technical', venue: 'Mechanical Workshop Annex',
      start: daysFromNow(-6, 10, 0), end: daysFromNow(-6, 17, 0), deadline: daysFromNow(-7, 23, 59), capacity: 200,
    },
  ];

  const insert = db.prepare(`
    INSERT INTO events (title, description, category, venue, start_datetime, end_datetime, registration_deadline, capacity, status)
    VALUES (@title, @description, @category, @venue, @start, @end, @deadline, @capacity, 'published')
  `);
  const tx = db.transaction((rows) => {
    for (const r of rows) {
      insert.run({ ...r, start: iso(r.start), end: iso(r.end), deadline: iso(r.deadline) });
    }
  });
  tx(samples);
  console.log(`[seed] Inserted ${samples.length} sample events`);
}

function seed() {
  seedAdmin();
  seedEvents();
}

module.exports = seed;
