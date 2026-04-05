const express = require('express');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Directory setup ──────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const BANNERS_DIR = path.join(__dirname, 'public', 'banners');
const BANNERS_JSON = path.join(DATA_DIR, 'banners.json');

[DATA_DIR, BANNERS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});
if (!fs.existsSync(BANNERS_JSON)) fs.writeFileSync(BANNERS_JSON, '[]');

// ── Helpers ──────────────────────────────────────────────────────
function loadBanners() {
  try { return JSON.parse(fs.readFileSync(BANNERS_JSON, 'utf8')); }
  catch (e) { return []; }
}
function saveBanners(banners) {
  fs.writeFileSync(BANNERS_JSON, JSON.stringify(banners, null, 2));
}

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
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, BANNERS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Images only'));
  }
});

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
  if (idx !== -1) items[idx] = { ...items[idx], ...req.body, active: req.body.active !== 'false' };
  saveContent('weekends', items);
  res.json({ success: true });
});
app.post('/admin/weekends/delete/:id', requireAdmin, (req, res) => {
  saveContent('weekends', loadContent('weekends').filter(x => x.id !== req.params.id));
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
    items[idx] = { ...items[idx], name: req.body.name, price: Number(req.body.price),
      featured: req.body.featured === 'true', features, active: req.body.active !== 'false' };
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

// ── Catch-all ────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`NorthBound site running on port ${PORT} | __dirname: ${__dirname}`);
  console.log('admin dir exists:', require('fs').existsSync(require('path').join(__dirname, 'admin')));
});
