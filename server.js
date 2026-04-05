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

// ── Catch-all ────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`NorthBound site running on port ${PORT} | __dirname: ${__dirname}`);
  console.log('admin dir exists:', require('fs').existsSync(require('path').join(__dirname, 'admin')));
});
