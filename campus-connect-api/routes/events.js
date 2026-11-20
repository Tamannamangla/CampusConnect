import { Router } from 'express';
import { pool } from '../db/pool.js';
import validateEvent from '../middleware/validateEvent.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { cacheGet, cacheSet, cacheClear } from '../cache.js';

const router = Router();

// One query that builds an event exactly as React expects it
const SELECT_EVENTS = `
  SELECT e.id, e.title, e.club, e.category,
         to_char(e.event_date, 'YYYY-MM-DD') AS date,
         e.seats,
         COUNT(r.id)::int AS registered
  FROM events e
  LEFT JOIN rsvps r ON r.event_id = e.id
`;

// Checks that :id is a positive whole number
function parseId(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(404).json({ error: 'Event not found' });
  }
  req.eventId = id;
  next();
}

async function findEvent(id) {
  const result = await pool.query(`${SELECT_EVENTS} WHERE e.id = $1 GROUP BY e.id`, [id]);
  return result.rows[0];
}

// GET /events  (public)
// Filters: ?category=Tech&q=web      Pagination: ?page=1&limit=10
router.get('/', async (req, res) => {
  // 1. Cache-aside: look in the cache first
  const cacheKey = req.originalUrl;
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.set('X-Cache', 'HIT');
    if (cached.total !== null) res.set('X-Total-Count', String(cached.total));
    return res.json(cached.rows);
  }

  // 2. Build the filters
  const { category, q } = req.query;
  const conditions = [];
  const values = [];
  if (category) {
    values.push(category);
    conditions.push(`e.category = $${values.length}`);
  }
  if (q) {
    values.push(`%${q}%`);
    conditions.push(`e.title ILIKE $${values.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // 3. Pagination (optional)
  const page = Number(req.query.page);
  const limit = Number(req.query.limit);
  const paginate = Number.isInteger(page) && page >= 1 && Number.isInteger(limit) && limit >= 1;

  let total = null;
  let pageClause = '';
  const queryValues = [...values];
  if (paginate) {
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM events e ${where}`,
      values
    );
    total = countResult.rows[0].total;
    const size = Math.min(limit, 100);
    queryValues.push(size, (page - 1) * size);
    pageClause = `LIMIT $${queryValues.length - 1} OFFSET $${queryValues.length}`;
  }

  // 4. Ask the database (ORDER BY keeps the pages stable)
  const result = await pool.query(
    `${SELECT_EVENTS} ${where} GROUP BY e.id ORDER BY e.id ${pageClause}`,
    queryValues
  );

  // 5. Save in the cache for 30 seconds and answer
  cacheSet(cacheKey, { rows: result.rows, total });
  res.set('X-Cache', 'MISS');
  if (total !== null) res.set('X-Total-Count', String(total));
  res.json(result.rows);
});

// GET /events/:id  (public)
router.get('/:id', parseId, async (req, res) => {
  const event = await findEvent(req.eventId);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json(event);
});

// POST /events  (admin only)
router.post('/', requireAuth, requireRole('admin'), validateEvent, async (req, res) => {
  const { title, club, category, date, seats } = req.body;
  const inserted = await pool.query(
    `INSERT INTO events (title, club, category, event_date, seats)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [title.trim(), club.trim(), category, date, Number(seats)]
  );
  cacheClear();
  const created = await findEvent(inserted.rows[0].id);
  res.status(201).json(created);
});

// PUT /events/:id  (admin only)
router.put('/:id', requireAuth, requireRole('admin'), parseId, validateEvent, async (req, res) => {
  const { title, club, category, date, seats } = req.body;
  const updated = await pool.query(
    `UPDATE events
     SET title = $1, club = $2, category = $3, event_date = $4, seats = $5
     WHERE id = $6`,
    [title.trim(), club.trim(), category, date, Number(seats), req.eventId]
  );
  if (updated.rowCount === 0) return res.status(404).json({ error: 'Event not found' });
  cacheClear();
  res.json(await findEvent(req.eventId));
});

// DELETE /events/:id  (admin only)
router.delete('/:id', requireAuth, requireRole('admin'), parseId, async (req, res) => {
  const result = await pool.query('DELETE FROM events WHERE id = $1', [req.eventId]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'Event not found' });
  cacheClear();
  res.json({ message: 'Event deleted' });
});

// POST /events/:id/rsvp  (any logged-in user, always for themselves)
router.post('/:id/rsvp', requireAuth, parseId, async (req, res) => {
  const event = await findEvent(req.eventId);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (event.registered >= event.seats) {
    return res.status(409).json({ error: 'Event is full' });
  }
  try {
    await pool.query(
      'INSERT INTO rsvps (user_id, event_id) VALUES ($1, $2)',
      [req.user.id, req.eventId]
    );
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'You have already registered for this event' });
    }
    throw err;
  }
  cacheClear();
  res.json(await findEvent(req.eventId));
});

// DELETE /events/:id/rsvp  (cancel my own RSVP)
router.delete('/:id/rsvp', requireAuth, parseId, async (req, res) => {
  const result = await pool.query(
    'DELETE FROM rsvps WHERE user_id = $1 AND event_id = $2',
    [req.user.id, req.eventId]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'You have not registered for this event' });
  }
  cacheClear();
  res.json(await findEvent(req.eventId));
});

export default router;
