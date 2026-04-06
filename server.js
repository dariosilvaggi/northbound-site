const express = require('express');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Stripe = require('stripe');
const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;

const app = express();
const PORT = process.env.PORT || 3000;

// ── Directory setup ──────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const BANNERS_DIR = path.join(__dirname, 'public', 'banners');
const WEEKENDS_IMG_DIR = path.join(__dirname, 'public', 'weekends-images');
const BANNERS_JSON = path.join(DATA_DIR, 'banners.json');
const BOOKINGS_JSON = path.join(DATA_DIR, 'bookings.json');

[DATA_DIR, BANNERS_DIR, WEEKENDS_IMG_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});
if (!fs.existsSync(BANNERS_JSON)) fs.writeFileSync(BANNERS_JSON, '[]');
if (!fs.existsSync(BOOKINGS_JSON)) fs.writeFileSync(BOOKINGS_JSON, '[]');

// ── Helpers ──────────────────────────────────────────────────────
function loadBanners() {
  try { return JSON.parse(fs.readFileSync(BANNERS_JSON, 'utf8')); }
  catch (e) { return []; }
}
function saveBanners(banners) {
  fs.writeFileSync(BANNERS_JSON, JSON.stringify(banners, null, 2));
}
function loadBookings() {
  try { return JSON.parse(fs.readFileSync(BOOKINGS_JSON, 'utf8')); }
  catch (e) { return []; }
}
function saveBookings(b) {
  fs.writeFileSync(BOOKINGS_JSON, JSON.stringify(b, null, 2));
}

// ── Stripe webhook (raw body — must be BEFORE express.json()) ────
app.post('/api/webhook/stripe', express.raw({ type: 'application/json' }), (req, res) => {
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
    const bookings = loadBookings();
    bookings.unshift({
      id: s.id,
      email: s.customer_email,
      amountPaid: s.amount_total,
      currency: s.currency,
      metadata: s.metadata || {},
      status: 'paid',
      paidAt: new Date().toISOString()
    });
    saveBookings(bookings);
    console.log('Booking recorded:', s.id, s.customer_email);
  }
  res.json({ received: true });
});

// ── Security ─────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'js.stripe.com', 'cdnjs.cloudflare.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      fontSrc: ["'self'", 'fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'api.stripe.com'],
      frameSrc: ['js.stripe.com', 'hooks.stripe.com'],
      upgradeInsecureRequests: [],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.disable('x-powered-by');

// Rate limiting
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
const checkoutLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
app.use('/api/', apiLimiter);
app.use('/api/checkout', checkoutLimiter);
app.use('/admin/', adminLimiter);

// ── Middleware ───────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'nb-admin-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));

// ── File upload ──────────────────────────────────────────────────
function makeUploader(dir) {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, dir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
      }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('Images only'));
    }
  });
}
const upload = makeUploader(BANNERS_DIR);
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
    if (err) {
      console.error('LOGIN FILE ERROR:', err.message, '| path:', fp);
      return res.status(500).send('File error: ' + err.message + ' | path: ' + fp);
    }
    res.setHeader('Content-Type', 'text/html');
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
    if (err) {
      console.error('DASHBOARD FILE ERROR:', err.message, '| path:', fp);
      return res.status(500).send('File error: ' + err.message + ' | path: ' + fp);
    }
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  });
});

app.get('/admin/api/banners', requireAdmin, (req, res) => {
  res.json(loadBanners());
});

app.post('/admin/upload', requireAdmin, upload.single('banner'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const banners = loadBanners();
  banners.unshift({
    id: crypto.randomBytes(8).toString('hex'),
    filename: req.file.filename,
    url: (req.body.url || '').trim(),
    active: true,
    createdAt: new Date().toISOString()
  });
  saveBanners(banners);
  res.redirect('/admin');
});

app.post('/admin/toggle/:id', requireAdmin, (req, res) => {
  const banners = loadBanners();
  const b = banners.find(x => x.id === req.params.id);
  if (b) b.active = !b.active;
  saveBanners(banners);
  res.json({ success: true, active: b ? b.active : null });
});

app.post('/admin/delete/:id', requireAdmin, (req, res) => {
  let banners = loadBanners();
  const b = banners.find(x => x.id === req.params.id);
  if (b) {
    const fp = path.join(BANNERS_DIR, b.filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    banners = banners.filter(x => x.id !== req.params.id);
    saveBanners(banners);
  }
  res.json({ success: true });
});

// ── Public API ───────────────────────────────────────────────────
app.get('/api/banners', (req, res) => {
  res.json(loadBanners().filter(b => b.active));
});

// ── Content data helpers ─────────────────────────────────────────
const CONTENT_SECTIONS = ['weekends', 'packages', 'cities', 'clubs', 'itinerary'];

function loadContent(name) {
  const fp = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(fp)) return [];
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch (e) { return []; }
}
function saveContent(name, data) {
  fs.writeFileSync(path.join(DATA_DIR, `${name}.json`), JSON.stringify(data, null, 2));
}
function newId() { return crypto.randomBytes(6).toString('hex'); }

// ── Public content APIs ───────────────────────────────────────────
CONTENT_SECTIONS.forEach(section => {
  app.get(`/api/${section}`, (req, res) => {
    const items = loadContent(section);
    res.json(items.filter(x => x.active !== false));
  });
});

// ── Admin content APIs ────────────────────────────────────────────

// GET all (admin, includes inactive)
CONTENT_SECTIONS.forEach(section => {
  app.get(`/admin/api/${section}`, requireAdmin, (req, res) => {
    res.json(loadContent(section));
  });
});

// ── Weekends CRUD ─────────────────────────────────────────────────
app.post('/admin/weekends/add', requireAdmin, (req, res) => {
  const items = loadContent('weekends');
  const item = { id: newId(), ...req.body, active: req.body.active !== 'false' };
  items.push(item);
  saveContent('weekends', items);
  res.json({ success: true, item });
});
app.post('/admin/weekends/update/:id', requireAdmin, (req, res) => {
  const items = loadContent('weekends');
  const idx = items.findIndex(x => x.id === req.params.id);
  if (idx !== -1) {
    const merged = { ...items[idx] };
    Object.keys(req.body).forEach(k => { if (req.body[k] !== '' && req.body[k] !== undefined) merged[k] = req.body[k]; });
    merged.active = req.body.active !== 'false';
    items[idx] = merged;
  }
  saveContent('weekends', items);
  res.json({ success: true });
});
app.post('/admin/weekends/delete/:id', requireAdmin, (req, res) => {
  saveContent('weekends', loadContent('weekends').filter(x => x.id !== req.params.id));
  res.json({ success: true });
});
app.post('/admin/weekends/upload-image/:id', requireAdmin, weekendUpload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  const items = loadContent('weekends');
  const item = items.find(x => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Weekend not found' });
  // Delete old image if exists
  if (item.image) {
    const oldPath = path.join(WEEKENDS_IMG_DIR, path.basename(item.image));
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  item.image = `/weekends-images/${req.file.filename}`;
  saveContent('weekends', items);
  res.json({ success: true, image: item.image });
});
app.post('/admin/weekends/remove-image/:id', requireAdmin, (req, res) => {
  const items = loadContent('weekends');
  const item = items.find(x => x.id === req.params.id);
  if (item && item.image) {
    const oldPath = path.join(WEEKENDS_IMG_DIR, path.basename(item.image));
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    delete item.image;
    saveContent('weekends', items);
  }
  res.json({ success: true });
});
app.post('/admin/weekends/toggle/:id', requireAdmin, (req, res) => {
  const items = loadContent('weekends');
  const item = items.find(x => x.id === req.params.id);
  if (item) item.active = !item.active;
  saveContent('weekends', items);
  res.json({ success: true, active: item ? item.active : null });
});

// ── Packages CRUD ─────────────────────────────────────────────────
app.post('/admin/packages/add', requireAdmin, (req, res) => {
  const items = loadContent('packages');
  const features = (req.body.featuresRaw || '').split('\n')
    .map(l => l.trim()).filter(Boolean)
    .map(l => ({ text: l.replace(/^[-+] ?/, ''), included: !l.startsWith('-') }));
  const item = {
    id: newId(),
    name: req.body.name,
    price: Number(req.body.price),
    featured: req.body.featured === 'true',
    features,
    active: req.body.active !== 'false'
  };
  items.push(item);
  saveContent('packages', items);
  res.json({ success: true, item });
});
app.post('/admin/packages/update/:id', requireAdmin, (req, res) => {
  const items = loadContent('packages');
  const idx = items.findIndex(x => x.id === req.params.id);
  if (idx !== -1) {
    const features = (req.body.featuresRaw || '').split('\n')
      .map(l => l.trim()).filter(Boolean)
      .map(l => ({ text: l.replace(/^[-+] ?/, ''), included: !l.startsWith('-') }));
    const price = parseFloat(req.body.price);
    items[idx] = {
      ...items[idx],
      name: req.body.name || items[idx].name,
      price: isNaN(price) ? items[idx].price : price,
      featured: req.body.featured === 'true',
      features: features.length ? features : items[idx].features,
      active: req.body.active !== 'false'
    };
  }
  saveContent('packages', items);
  res.json({ success: true });
});
app.post('/admin/packages/delete/:id', requireAdmin, (req, res) => {
  saveContent('packages', loadContent('packages').filter(x => x.id !== req.params.id));
  res.json({ success: true });
});
app.post('/admin/packages/toggle/:id', requireAdmin, (req, res) => {
  const items = loadContent('packages');
  const item = items.find(x => x.id === req.params.id);
  if (item) item.active = !item.active;
  saveContent('packages', items);
  res.json({ success: true, active: item ? item.active : null });
});

// ── Cities CRUD ───────────────────────────────────────────────────
app.post('/admin/cities/add', requireAdmin, (req, res) => {
  const items = loadContent('cities');
  items.push({ id: newId(), ...req.body, active: req.body.active !== 'false' });
  saveContent('cities', items);
  res.json({ success: true });
});
app.post('/admin/cities/update/:id', requireAdmin, (req, res) => {
  const items = loadContent('cities');
  const idx = items.findIndex(x => x.id === req.params.id);
  if (idx !== -1) items[idx] = { ...items[idx], ...req.body, active: req.body.active !== 'false' };
  saveContent('cities', items);
  res.json({ success: true });
});
app.post('/admin/cities/delete/:id', requireAdmin, (req, res) => {
  saveContent('cities', loadContent('cities').filter(x => x.id !== req.params.id));
  res.json({ success: true });
});
app.post('/admin/cities/toggle/:id', requireAdmin, (req, res) => {
  const items = loadContent('cities');
  const item = items.find(x => x.id === req.params.id);
  if (item) item.active = !item.active;
  saveContent('cities', items);
  res.json({ success: true, active: item ? item.active : null });
});

// ── Clubs CRUD ────────────────────────────────────────────────────
app.post('/admin/clubs/add', requireAdmin, (req, res) => {
  const items = loadContent('clubs');
  const perks = (req.body.perksRaw || '').split(',').map(p => p.trim()).filter(Boolean);
  items.push({ id: newId(), name: req.body.name, type: req.body.type,
    emoji: req.body.emoji || '🎵', description: req.body.description, perks, active: req.body.active !== 'false' });
  saveContent('clubs', items);
  res.json({ success: true });
});
app.post('/admin/clubs/update/:id', requireAdmin, (req, res) => {
  const items = loadContent('clubs');
  const idx = items.findIndex(x => x.id === req.params.id);
  if (idx !== -1) {
    const perks = (req.body.perksRaw || '').split(',').map(p => p.trim()).filter(Boolean);
    items[idx] = { ...items[idx], name: req.body.name, type: req.body.type,
      emoji: req.body.emoji || items[idx].emoji, description: req.body.description,
      perks, active: req.body.active !== 'false' };
  }
  saveContent('clubs', items);
  res.json({ success: true });
});
app.post('/admin/clubs/delete/:id', requireAdmin, (req, res) => {
  saveContent('clubs', loadContent('clubs').filter(x => x.id !== req.params.id));
  res.json({ success: true });
});
app.post('/admin/clubs/toggle/:id', requireAdmin, (req, res) => {
  const items = loadContent('clubs');
  const item = items.find(x => x.id === req.params.id);
  if (item) item.active = !item.active;
  saveContent('clubs', items);
  res.json({ success: true, active: item ? item.active : null });
});

// ── Itinerary CRUD ────────────────────────────────────────────────
app.post('/admin/itinerary/day/add', requireAdmin, (req, res) => {
  const days = loadContent('itinerary');
  days.push({ id: newId(), day: req.body.day, active: true, items: [] });
  saveContent('itinerary', days);
  res.json({ success: true });
});
app.post('/admin/itinerary/day/delete/:dayId', requireAdmin, (req, res) => {
  saveContent('itinerary', loadContent('itinerary').filter(d => d.id !== req.params.dayId));
  res.json({ success: true });
});
app.post('/admin/itinerary/day/rename/:dayId', requireAdmin, (req, res) => {
  const days = loadContent('itinerary');
  const day = days.find(d => d.id === req.params.dayId);
  if (day) day.day = req.body.day;
  saveContent('itinerary', days);
  res.json({ success: true });
});
app.post('/admin/itinerary/item/add/:dayId', requireAdmin, (req, res) => {
  const days = loadContent('itinerary');
  const day = days.find(d => d.id === req.params.dayId);
  if (day) day.items.push({ id: newId(), time: req.body.time, title: req.body.title, description: req.body.description });
  saveContent('itinerary', days);
  res.json({ success: true });
});
app.post('/admin/itinerary/item/update/:dayId/:itemId', requireAdmin, (req, res) => {
  const days = loadContent('itinerary');
  const day = days.find(d => d.id === req.params.dayId);
  if (day) {
    const idx = day.items.findIndex(i => i.id === req.params.itemId);
    if (idx !== -1) day.items[idx] = { ...day.items[idx], time: req.body.time, title: req.body.title, description: req.body.description };
  }
  saveContent('itinerary', days);
  res.json({ success: true });
});
app.post('/admin/itinerary/item/delete/:dayId/:itemId', requireAdmin, (req, res) => {
  const days = loadContent('itinerary');
  const day = days.find(d => d.id === req.params.dayId);
  if (day) day.items = day.items.filter(i => i.id !== req.params.itemId);
  saveContent('itinerary', days);
  res.json({ success: true });
});

// ── Stripe Checkout ───────────────────────────────────────────────
app.post('/api/checkout', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured — add STRIPE_SECRET_KEY to Railway env vars.' });
  const { weekend, packageName, packagePrice, travelers, firstName, lastName, email, phone, city } = req.body;
  if (!email || !weekend || !packageName) return res.status(400).json({ error: 'Missing required fields.' });

  // Full price in cents — no deposit model
  const baseCents = Math.round(parseFloat(packagePrice || 0) * 100);
  if (!baseCents) return res.status(400).json({ error: 'Invalid package price.' });

  // MAT 6% → HST 13% on (base + MAT)
  const matCents = Math.round(baseCents * 0.06);
  const hstCents = Math.round((baseCents + matCents) * 0.13);

  // Admin fee by group size
  const numTravelers = parseInt(travelers) || 1;
  const adminFeeMap  = { 2: 200, 3: 300, 4: 400 };
  const adminCents   = adminFeeMap[numTravelers] || 0;

  const siteUrl = process.env.SITE_URL || 'https://northboundweekends.com';

  const lineItems = [
    {
      price_data: {
        currency: 'usd',
        product_data: {
          name: `NorthBound Weekends — ${weekend}`,
          description: `${packageName} Package · ${numTravelers} traveler(s) · No refunds`,
        },
        unit_amount: baseCents,
      },
      quantity: 1,
    },
    {
      price_data: {
        currency: 'usd',
        product_data: { name: 'Municipal Accommodation Tax (MAT 6%)' },
        unit_amount: matCents,
      },
      quantity: 1,
    },
    {
      price_data: {
        currency: 'usd',
        product_data: { name: 'HST (13%)' },
        unit_amount: hstCents,
      },
      quantity: 1,
    },
  ];

  if (adminCents > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: `Admin Fee (group of ${numTravelers})` },
        unit_amount: adminCents,
      },
      quantity: 1,
    });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      customer_email: email,
      metadata: {
        weekend, packageName, packagePrice: String(packagePrice || ''),
        travelers: String(numTravelers), firstName, lastName, phone, city,
        baseCents: String(baseCents), matCents: String(matCents),
        hstCents: String(hstCents), adminCents: String(adminCents),
      },
      success_url: `${siteUrl}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/booking-cancel`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: Bookings ───────────────────────────────────────────────
app.get('/admin/api/bookings', requireAdmin, (req, res) => {
  res.json(loadBookings());
});

// ── SEO: robots.txt + sitemap ────────────────────────────────────
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    'User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /admin/*\n\nSitemap: https://northboundweekends.com/sitemap.xml'
  );
});
app.get('/sitemap.xml', (req, res) => {
  const base = 'https://northboundweekends.com';
  const now = new Date().toISOString().split('T')[0];
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`NorthBound site running on port ${PORT} | __dirname: ${__dirname}`);
  console.log('admin dir exists:', require('fs').existsSync(require('path').join(__dirname, 'admin')));
});
