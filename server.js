const express = require('express');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Stripe = require('stripe');
const { Pool } = require('pg');

const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

const app = express();
const PORT = process.env.PORT || 3000;

// ── Directory setup ──────────────────────────────────────────────
const DATA_DIR        = path.join(__dirname, 'data');
const BANNERS_DIR     = path.join(__dirname, 'public', 'banners');
const WEEKENDS_IMG_DIR = path.join(__dirname, 'public', 'weekends-images');
const BANNERS_JSON    = path.join(DATA_DIR, 'banners.json');
const BOOKINGS_JSON   = path.join(DATA_DIR, 'bookings.json');

[DATA_DIR, BANNERS_DIR, WEEKENDS_IMG_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});
if (!fs.existsSync(BANNERS_JSON))  fs.writeFileSync(BANNERS_JSON,  '[]');
if (!fs.existsSync(BOOKINGS_JSON)) fs.writeFileSync(BOOKINGS_JSON, '[]');

// ── Default seed data ────────────────────────────────────────────
const DEFAULT_PACKAGES = [
  {
    id: 'eddfb976bcfa',
    name: '4 Guest 1 Night Stay',
    price: 276,
    featured: true,
    features: [
      { text: 'Round-trip chartered coach',           included: true },
      { text: 'Border crossing coordination',          included: true },
      { text: '1-night hotel stay (downtown Detroit)', included: true },
      { text: 'Tour staff on-site',                   included: true }
    ],
    active: true
  }
];

// ── PostgreSQL helpers ───────────────────────────────────────────
async function initDB() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS content (
      section TEXT PRIMARY KEY,
      data    JSONB NOT NULL DEFAULT '[]'
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS banners (
      id   TEXT PRIMARY KEY,
      data JSONB NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id      TEXT PRIMARY KEY,
      data    JSONB NOT NULL,
      paid_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Seed packages if table is empty for this section
  const pkgRow = await pool.query("SELECT 1 FROM content WHERE section = 'packages'");
  if (pkgRow.rowCount === 0) {
    await pool.query(
      'INSERT INTO content (section, data) VALUES ($1, $2)',
      ['packages', JSON.stringify(DEFAULT_PACKAGES)]
    );
    console.log('Seeded default packages into PostgreSQL');
  }

  console.log('PostgreSQL connected and tables ready');
}

async function loadContent(name) {
  if (pool) {
    const { rows } = await pool.query('SELECT data FROM content WHERE section = $1', [name]);
    return rows.length ? rows[0].data : [];
  }
  // Fallback: file system
  const fp = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(fp)) return [];
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return []; }
}

async function saveContent(name, data) {
  if (pool) {
    await pool.query(
      'INSERT INTO content (section, data) VALUES ($1, $2) ON CONFLICT (section) DO UPDATE SET data = $2',
      [name, JSON.stringify(data)]
    );
    return;
  }
  fs.writeFileSync(path.join(DATA_DIR, `${name}.json`), JSON.stringify(data, null, 2));
}

async function loadBanners() {
  if (pool) {
    const { rows } = await pool.query('SELECT data FROM banners ORDER BY (data->>\'createdAt\') DESC');
    return rows.map(r => r.data);
  }
  try { return JSON.parse(fs.readFileSync(BANNERS_JSON, 'utf8')); } catch { return []; }
}

async function saveBanner(banner) {
  if (pool) {
    await pool.query(
      'INSERT INTO banners (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2',
      [banner.id, JSON.stringify(banner)]
    );
    return;
  }
  const banners = await loadBanners();
  banners.unshift(banner);
  fs.writeFileSync(BANNERS_JSON, JSON.stringify(banners, null, 2));
}

async function deleteBanner(id) {
  if (pool) {
    await pool.query('DELETE FROM banners WHERE id = $1', [id]);
    return;
  }
  let banners = await loadBanners();
  banners = banners.filter(b => b.id !== id);
  fs.writeFileSync(BANNERS_JSON, JSON.stringify(banners, null, 2));
}

async function updateBanner(id, patch) {
  const banners = await loadBanners();
  const b = banners.find(x => x.id === id);
  if (!b) return null;
  Object.assign(b, patch);
  await saveBanner(b);
  return b;
}

async function loadBookings() {
  if (pool) {
    const { rows } = await pool.query('SELECT data FROM bookings ORDER BY paid_at DESC');
    return rows.map(r => r.data);
  }
  try { return JSON.parse(fs.readFileSync(BOOKINGS_JSON, 'utf8')); } catch { return []; }
}

async function saveBooking(booking) {
  if (pool) {
    await pool.query(
      'INSERT INTO bookings (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2',
      [booking.id, JSON.stringify(booking)]
    );
    return;
  }
  const bookings = await loadBookings();
  bookings.unshift(booking);
  fs.writeFileSync(BOOKINGS_JSON, JSON.stringify(bookings, null, 2));
}

function newId() { return crypto.randomBytes(6).toString('hex'); }

// ── Stripe webhook (raw body — must be BEFORE express.json()) ────
app.post('/api/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(400).json({ error: 'Stripe not configured' });
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    await saveBooking({
      id:        s.id,
      email:     s.customer_email,
      amountPaid: s.amount_total,
      currency:  s.currency,
      metadata:  s.metadata || {},
      status:    'paid',
      paidAt:    new Date().toISOString()
    });
    console.log('Booking recorded:', s.id, s.customer_email);
  }
  res.json({ received: true });
});

// Trust Railway's reverse proxy (needed for express-rate-limit X-Forwarded-For)
app.set('trust proxy', 1);

// ── Security ─────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:           ["'self'"],
      scriptSrc:            ["'self'", "'unsafe-inline'", 'js.stripe.com', 'cdnjs.cloudflare.com'],
      styleSrc:             ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      fontSrc:              ["'self'", 'fonts.gstatic.com'],
      imgSrc:               ["'self'", 'data:', 'https:'],
      connectSrc:           ["'self'", 'api.stripe.com'],
      frameSrc:             ['js.stripe.com', 'hooks.stripe.com'],
      upgradeInsecureRequests: [],
    },
  },
  hsts:           { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.disable('x-powered-by');

const apiLimiter      = rateLimit({ windowMs: 15*60*1000, max: 60,  standardHeaders: true, legacyHeaders: false });
const checkoutLimiter = rateLimit({ windowMs: 15*60*1000, max: 10,  standardHeaders: true, legacyHeaders: false });
const adminLimiter    = rateLimit({ windowMs: 15*60*1000, max: 30,  standardHeaders: true, legacyHeaders: false });
app.use('/api/',      apiLimiter);
app.use('/api/checkout', checkoutLimiter);
app.use('/admin/',   adminLimiter);

// ── Middleware ───────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret:            process.env.SESSION_SECRET || 'nb-admin-secret-change-me',
  resave:            false,
  saveUninitialized: false,
  cookie:            { maxAge: 8 * 60 * 60 * 1000 }
}));

// ── File upload ──────────────────────────────────────────────────
function makeUploader(dir) {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, dir),
      filename:    (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
      }
    }),
    limits:     { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('Images only'));
    }
  });
}
const upload        = makeUploader(BANNERS_DIR);
const weekendUpload = makeUploader(WEEKENDS_IMG_DIR);

// ── Auth middleware ──────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.redirect('/admin/login');
}

// ── Admin routes ─────────────────────────────────────────────────
app.get('/admin/login', (req, res) => {
  const fp = path.join(__dirname, 'admin', 'login.html');
  fs.readFile(fp, 'utf8', (err, html) => {
    if (err) return res.status(500).send('File error: ' + err.message);
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(html);
  });
});

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === (process.env.ADMIN_USER || 'admin') &&
      password === (process.env.ADMIN_PASS || 'changeme')) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  res.redirect('/admin/login?error=1');
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

app.get('/admin', requireAdmin, (req, res) => {
  const fp = path.join(__dirname, 'admin', 'dashboard.html');
  fs.readFile(fp, 'utf8', (err, html) => {
    if (err) return res.status(500).send('File error: ' + err.message);
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(html);
  });
});

// ── Banners ───────────────────────────────────────────────────────
app.get('/api/banners', async (req, res) => {
  const banners = await loadBanners();
  res.json(banners.filter(b => b.active));
});

app.get('/admin/api/banners', requireAdmin, async (req, res) => {
  res.json(await loadBanners());
});

app.post('/admin/upload', requireAdmin, upload.single('banner'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  await saveBanner({
    id:        crypto.randomBytes(8).toString('hex'),
    filename:  req.file.filename,
    url:       (req.body.url || '').trim(),
    active:    true,
    createdAt: new Date().toISOString()
  });
  res.redirect('/admin');
});

app.post('/admin/toggle/:id', requireAdmin, async (req, res) => {
  const banners = await loadBanners();
  const b = banners.find(x => x.id === req.params.id);
  if (b) {
    b.active = !b.active;
    await saveBanner(b);
  }
  res.json({ success: true, active: b ? b.active : null });
});

app.post('/admin/delete/:id', requireAdmin, async (req, res) => {
  const banners = await loadBanners();
  const b = banners.find(x => x.id === req.params.id);
  if (b) {
    const fp = path.join(BANNERS_DIR, b.filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    await deleteBanner(req.params.id);
  }
  res.json({ success: true });
});

// ── Content sections ──────────────────────────────────────────────
const CONTENT_SECTIONS = ['weekends', 'packages', 'cities', 'clubs', 'itinerary'];

// Public APIs
CONTENT_SECTIONS.forEach(section => {
  app.get(`/api/${section}`, async (req, res) => {
    const items = await loadContent(section);
    res.json(items.filter(x => x.active !== false));
  });
});

// Admin GET all (includes inactive)
CONTENT_SECTIONS.forEach(section => {
  app.get(`/admin/api/${section}`, requireAdmin, async (req, res) => {
    res.json(await loadContent(section));
  });
});

// ── Weekends CRUD ─────────────────────────────────────────────────
app.post('/admin/weekends/add', requireAdmin, async (req, res) => {
  const items = await loadContent('weekends');
  const item = { id: newId(), ...req.body, active: req.body.active !== 'false' };
  items.push(item);
  await saveContent('weekends', items);
  res.json({ success: true, item });
});
app.post('/admin/weekends/update/:id', requireAdmin, async (req, res) => {
  const items = await loadContent('weekends');
  const idx = items.findIndex(x => x.id === req.params.id);
  if (idx !== -1) {
    const merged = { ...items[idx] };
    Object.keys(req.body).forEach(k => { if (req.body[k] !== '' && req.body[k] !== undefined) merged[k] = req.body[k]; });
    merged.active = req.body.active !== 'false';
    items[idx] = merged;
  }
  await saveContent('weekends', items);
  res.json({ success: true });
});
app.post('/admin/weekends/delete/:id', requireAdmin, async (req, res) => {
  const items = await loadContent('weekends');
  await saveContent('weekends', items.filter(x => x.id !== req.params.id));
  res.json({ success: true });
});
app.post('/admin/weekends/upload-image/:id', requireAdmin, weekendUpload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  const items = await loadContent('weekends');
  const item = items.find(x => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Weekend not found' });
  if (item.image) {
    const oldPath = path.join(WEEKENDS_IMG_DIR, path.basename(item.image));
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  item.image = `/weekends-images/${req.file.filename}`;
  await saveContent('weekends', items);
  res.json({ success: true, image: item.image });
});
app.post('/admin/weekends/remove-image/:id', requireAdmin, async (req, res) => {
  const items = await loadContent('weekends');
  const item = items.find(x => x.id === req.params.id);
  if (item && item.image) {
    const oldPath = path.join(WEEKENDS_IMG_DIR, path.basename(item.image));
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    delete item.image;
    await saveContent('weekends', items);
  }
  res.json({ success: true });
});
app.post('/admin/weekends/toggle/:id', requireAdmin, async (req, res) => {
  const items = await loadContent('weekends');
  const item = items.find(x => x.id === req.params.id);
  if (item) item.active = !item.active;
  await saveContent('weekends', items);
  res.json({ success: true, active: item ? item.active : null });
});

// ── Packages CRUD ─────────────────────────────────────────────────
app.post('/admin/packages/add', requireAdmin, async (req, res) => {
  const items = await loadContent('packages');
  const features = (req.body.featuresRaw || '').split('\n')
    .map(l => l.trim()).filter(Boolean)
    .map(l => ({ text: l.replace(/^[-+] ?/, ''), included: !l.startsWith('-') }));
  const item = {
    id:       newId(),
    name:     req.body.name,
    price:    Number(req.body.price),
    featured: req.body.featured === 'true',
    features,
    active:   req.body.active !== 'false'
  };
  items.push(item);
  await saveContent('packages', items);
  res.json({ success: true, item });
});
app.post('/admin/packages/update/:id', requireAdmin, async (req, res) => {
  const items = await loadContent('packages');
  const idx = items.findIndex(x => x.id === req.params.id);
  if (idx !== -1) {
    const features = (req.body.featuresRaw || '').split('\n')
      .map(l => l.trim()).filter(Boolean)
      .map(l => ({ text: l.replace(/^[-+] ?/, ''), included: !l.startsWith('-') }));
    const price = parseFloat(req.body.price);
    items[idx] = {
      ...items[idx],
      name:     req.body.name     || items[idx].name,
      price:    isNaN(price)      ? items[idx].price : price,
      featured: req.body.featured === 'true',
      features: features.length   ? features : items[idx].features,
      active:   req.body.active   !== 'false'
    };
  }
  await saveContent('packages', items);
  res.json({ success: true });
});
app.post('/admin/packages/delete/:id', requireAdmin, async (req, res) => {
  const items = await loadContent('packages');
  await saveContent('packages', items.filter(x => x.id !== req.params.id));
  res.json({ success: true });
});
app.post('/admin/packages/toggle/:id', requireAdmin, async (req, res) => {
  const items = await loadContent('packages');
  const item = items.find(x => x.id === req.params.id);
  if (item) item.active = !item.active;
  await saveContent('packages', items);
  res.json({ success: true, active: item ? item.active : null });
});

// ── Cities CRUD ───────────────────────────────────────────────────
app.post('/admin/cities/add', requireAdmin, async (req, res) => {
  const items = await loadContent('cities');
  items.push({ id: newId(), ...req.body, active: req.body.active !== 'false' });
  await saveContent('cities', items);
  res.json({ success: true });
});
app.post('/admin/cities/update/:id', requireAdmin, async (req, res) => {
  const items = await loadContent('cities');
  const idx = items.findIndex(x => x.id === req.params.id);
  if (idx !== -1) items[idx] = { ...items[idx], ...req.body, active: req.body.active !== 'false' };
  await saveContent('cities', items);
  res.json({ success: true });
});
app.post('/admin/cities/delete/:id', requireAdmin, async (req, res) => {
  const items = await loadContent('cities');
  await saveContent('cities', items.filter(x => x.id !== req.params.id));
  res.json({ success: true });
});
app.post('/admin/cities/toggle/:id', requireAdmin, async (req, res) => {
  const items = await loadContent('cities');
  const item = items.find(x => x.id === req.params.id);
  if (item) item.active = !item.active;
  await saveContent('cities', items);
  res.json({ success: true, active: item ? item.active : null });
});

// ── Clubs CRUD ────────────────────────────────────────────────────
app.post('/admin/clubs/add', requireAdmin, async (req, res) => {
  const items = await loadContent('clubs');
  const perks = (req.body.perksRaw || '').split(',').map(p => p.trim()).filter(Boolean);
  items.push({ id: newId(), name: req.body.name, type: req.body.type,
    emoji: req.body.emoji || '🎵', description: req.body.description, perks, active: req.body.active !== 'false' });
  await saveContent('clubs', items);
  res.json({ success: true });
});
app.post('/admin/clubs/update/:id', requireAdmin, async (req, res) => {
  const items = await loadContent('clubs');
  const idx = items.findIndex(x => x.id === req.params.id);
  if (idx !== -1) {
    const perks = (req.body.perksRaw || '').split(',').map(p => p.trim()).filter(Boolean);
    items[idx] = { ...items[idx], name: req.body.name, type: req.body.type,
      emoji: req.body.emoji || items[idx].emoji, description: req.body.description,
      perks, active: req.body.active !== 'false' };
  }
  await saveContent('clubs', items);
  res.json({ success: true });
});
app.post('/admin/clubs/delete/:id', requireAdmin, async (req, res) => {
  const items = await loadContent('clubs');
  await saveContent('clubs', items.filter(x => x.id !== req.params.id));
  res.json({ success: true });
});
app.post('/admin/clubs/toggle/:id', requireAdmin, async (req, res) => {
  const items = await loadContent('clubs');
  const item = items.find(x => x.id === req.params.id);
  if (item) item.active = !item.active;
  await saveContent('clubs', items);
  res.json({ success: true, active: item ? item.active : null });
});

// ── Itinerary CRUD ────────────────────────────────────────────────
app.post('/admin/itinerary/day/add', requireAdmin, async (req, res) => {
  const days = await loadContent('itinerary');
  days.push({ id: newId(), day: req.body.day, active: true, items: [] });
  await saveContent('itinerary', days);
  res.json({ success: true });
});
app.post('/admin/itinerary/day/delete/:dayId', requireAdmin, async (req, res) => {
  const days = await loadContent('itinerary');
  await saveContent('itinerary', days.filter(d => d.id !== req.params.dayId));
  res.json({ success: true });
});
app.post('/admin/itinerary/day/rename/:dayId', requireAdmin, async (req, res) => {
  const days = await loadContent('itinerary');
  const day = days.find(d => d.id === req.params.dayId);
  if (day) day.day = req.body.day;
  await saveContent('itinerary', days);
  res.json({ success: true });
});
app.post('/admin/itinerary/item/add/:dayId', requireAdmin, async (req, res) => {
  const days = await loadContent('itinerary');
  const day = days.find(d => d.id === req.params.dayId);
  if (day) day.items.push({ id: newId(), time: req.body.time, title: req.body.title, description: req.body.description });
  await saveContent('itinerary', days);
  res.json({ success: true });
});
app.post('/admin/itinerary/item/update/:dayId/:itemId', requireAdmin, async (req, res) => {
  const days = await loadContent('itinerary');
  const day = days.find(d => d.id === req.params.dayId);
  if (day) {
    const idx = day.items.findIndex(i => i.id === req.params.itemId);
    if (idx !== -1) day.items[idx] = { ...day.items[idx], time: req.body.time, title: req.body.title, description: req.body.description };
  }
  await saveContent('itinerary', days);
  res.json({ success: true });
});
app.post('/admin/itinerary/item/delete/:dayId/:itemId', requireAdmin, async (req, res) => {
  const days = await loadContent('itinerary');
  const day = days.find(d => d.id === req.params.dayId);
  if (day) day.items = day.items.filter(i => i.id !== req.params.itemId);
  await saveContent('itinerary', days);
  res.json({ success: true });
});

// ── Stripe Checkout ───────────────────────────────────────────────
app.post('/api/checkout', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured — add STRIPE_SECRET_KEY to Railway env vars.' });
  const { weekend, packageName, packagePrice, travelers, firstName, lastName, email, phone, city } = req.body;
  if (!email || !weekend || !packageName) return res.status(400).json({ error: 'Missing required fields.' });

  const baseCents  = Math.round(parseFloat(packagePrice || 0) * 100);
  if (!baseCents)  return res.status(400).json({ error: 'Invalid package price.' });
  const matCents   = Math.round(baseCents * 0.06);
  const hstCents   = Math.round((baseCents + matCents) * 0.13);
  const numTravelers = parseInt(travelers) || 1;
  const adminFeeMap  = { 2: 200, 3: 300, 4: 400 };
  const adminCents   = adminFeeMap[numTravelers] || 0;
  const siteUrl      = process.env.SITE_URL || 'https://northboundweekends.com';

  const lineItems = [
    { price_data: { currency: 'usd', product_data: { name: `NorthBound Weekends — ${weekend}`, description: `${packageName} Package · ${numTravelers} traveler(s) · No refunds` }, unit_amount: baseCents }, quantity: 1 },
    { price_data: { currency: 'usd', product_data: { name: 'Municipal Accommodation Tax (MAT 6%)' }, unit_amount: matCents }, quantity: 1 },
    { price_data: { currency: 'usd', product_data: { name: 'HST (13%)' }, unit_amount: hstCents }, quantity: 1 },
  ];
  if (adminCents > 0) {
    lineItems.push({ price_data: { currency: 'usd', product_data: { name: `Admin Fee (group of ${numTravelers})` }, unit_amount: adminCents }, quantity: 1 });
  }

  try {
    const s = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      customer_email: email,
      metadata: { weekend, packageName, packagePrice: String(packagePrice || ''), travelers: String(numTravelers), firstName, lastName, phone, city, baseCents: String(baseCents), matCents: String(matCents), hstCents: String(hstCents), adminCents: String(adminCents) },
      success_url: `${siteUrl}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${siteUrl}/booking-cancel`,
    });
    res.json({ url: s.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: Bookings ───────────────────────────────────────────────
app.get('/admin/api/bookings', requireAdmin, async (req, res) => {
  res.json(await loadBookings());
});

// ── SEO: robots.txt + sitemap ────────────────────────────────────
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    'User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /admin/*\n\nSitemap: https://northboundweekends.com/sitemap.xml'
  );
});
app.get('/sitemap.xml', (req, res) => {
  const base = 'https://northboundweekends.com';
  const now  = new Date().toISOString().split('T')[0];
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${base}/</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>${base}/booking-success</loc><lastmod>${now}</lastmod><changefreq>monthly</changefreq><priority>0.3</priority></url>
</urlset>`);
});

// ── Catch-all ────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Boot ──────────────────────────────────────────────────────────
initDB()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`NorthBound running on port ${PORT} | DB: ${pool ? 'PostgreSQL' : 'file system'}`);
    });
  })
  .catch(err => {
    console.error('DB init failed — starting without DB:', err.message);
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`NorthBound running on port ${PORT} | DB: file system (fallback)`);
    });
  });
