'use strict';
const express = require('express');
const events = require('../services/eventService');
const { toInt, CATEGORIES } = require('../services/validators');

const router = express.Router();

router.get('/categories', (req, res) => res.json({ categories: CATEGORIES }));

router.get('/', (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const category = typeof req.query.category === 'string' && CATEGORIES.includes(req.query.category) ? req.query.category : '';
    const scope = ['upcoming', 'past', 'all'].includes(req.query.scope) ? req.query.scope : 'upcoming';
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 24, 1), 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const result = events.listPublic({ q, category, scope, limit, offset: (page - 1) * limit });
    res.json({ ...result, page, limit });
  } catch (err) { next(err); }
});

router.get('/:id', (req, res, next) => {
  try {
    const event = events.getById(toInt(req.params.id, 'event id'));
    res.json({ event });
  } catch (err) { next(err); }
});

module.exports = router;
