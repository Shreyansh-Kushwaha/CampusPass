'use strict';
const express = require('express');
const tickets = require('../services/ticketService');
const { requireAuth } = require('../middleware/auth');
const { toInt } = require('../services/validators');
const { HttpError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(requireAuth);

// List the logged-in student's registrations (dashboard).
router.get('/', (req, res, next) => {
  try {
    const list = tickets.listForUser(req.session.user.id).map(tickets.publicTicket);
    res.json({ registrations: list });
  } catch (err) { next(err); }
});

// Register for an event and receive a ticket.
router.post('/', async (req, res, next) => {
  try {
    const eventId = toInt(req.body.event_id, 'event id');
    const ticket = tickets.register(req.session.user.id, eventId);
    const qr = await tickets.qrDataUrl(ticket.ticket_token);
    res.status(201).json({ ticket: tickets.publicTicket(ticket), qr });
  } catch (err) { next(err); }
});

// Fetch one of the student's own tickets (with QR data URL).
router.get('/:id', async (req, res, next) => {
  try {
    const ticket = tickets.getTicketById(toInt(req.params.id, 'ticket id'));
    if (ticket.user_id !== req.session.user.id && req.session.user.role !== 'admin') throw new HttpError(404, 'Ticket not found.');
    const qr = await tickets.qrDataUrl(ticket.ticket_token);
    res.json({ ticket: tickets.publicTicket(ticket), qr });
  } catch (err) { next(err); }
});

// Download the QR code as a PNG.
router.get('/:id/qr.png', async (req, res, next) => {
  try {
    const ticket = tickets.getTicketById(toInt(req.params.id, 'ticket id'));
    if (ticket.user_id !== req.session.user.id && req.session.user.role !== 'admin') throw new HttpError(404, 'Ticket not found.');
    const png = await tickets.qrPngBuffer(ticket.ticket_token);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="campuspass-${ticket.ticket_token}.png"`);
    res.send(png);
  } catch (err) { next(err); }
});

// Cancel a registration.
router.delete('/:id', (req, res, next) => {
  try {
    const ticket = tickets.cancel(req.session.user.id, toInt(req.params.id, 'ticket id'));
    res.json({ ticket: tickets.publicTicket(ticket) });
  } catch (err) { next(err); }
});

module.exports = router;
