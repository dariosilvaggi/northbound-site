#!/usr/bin/env python3
"""Part 2: Add multer, nightlife_photos table, and API endpoints to server.js."""
import os, re

path = os.path.expanduser('~/temp-deploy/server.js')
with open(path) as f:
    s = f.read()

changes = 0

# 1. Add multer require
if 'multer' not in s:
    m = re.search(r"(const express = require\('express'\);?)", s)
    if m:
        s = s[:m.end()] + "\nconst multer = require('multer');\nconst upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });" + s[m.end():]
        changes += 1
        print('[1] Added multer require')

# 2. Add nightlife_photos table
if 'nightlife_photos' not in s:
    creates = list(re.finditer(r"await pool\.query\(`[^`]*CREATE TABLE[^`]*`\);", s))
    if creates:
        pos = creates[-1].end()
        tbl = '''
    await pool.query(`
      CREATE TABLE IF NOT EXISTS nightlife_photos (
        id SERIAL PRIMARY KEY, filename VARCHAR(255), caption VARCHAR(500),
        image_data TEXT NOT NULL, content_type VARCHAR(100) DEFAULT 'image/jpeg',
        sort_order INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT NOW()
      )
    `);
'''
        s = s[:pos] + tbl + s[pos:]
        changes += 1
        print('[2] Added nightlife_photos table')
    else:
        print('[2] SKIP - no CREATE TABLE found')

# 3. Add API endpoints before app.listen
api = '''
// Nightlife Photos API
app.get('/api/nightlife-photos', async (req, res) => {
  try {
    const r = await pool.query('SELECT id, filename, caption, sort_order FROM nightlife_photos ORDER BY sort_order ASC, created_at DESC');
    res.json({ photos: r.rows });
  } catch(e) { res.json({ photos: [] }); }
});

app.get('/api/nightlife-photos/:id/image', async (req, res) => {
  try {
    const r = await pool.query('SELECT image_data, content_type FROM nightlife_photos WHERE id = $1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).send('Not found');
    const p = r.rows[0];
    res.set('Content-Type', p.content_type || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(p.image_data, 'base64'));
  } catch(e) { res.status(500).send('Error'); }
});

app.post('/api/admin/nightlife-photos', upload.single('photo'), async (req, res) => {
  if (!req.session || !req.session.admin) return res.status(401).json({ error: 'Unauthorized' });
  if (!req.file) return res.status(400).json({ error: 'No file' });
  try {
    const b64 = req.file.buffer.toString('base64');
    const r = await pool.query(
      'INSERT INTO nightlife_photos (filename, caption, image_data, content_type, sort_order) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [req.file.originalname, req.body.caption || '', b64, req.file.mimetype, parseInt(req.body.sort_order) || 0]
    );
    res.json({ success: true, id: r.rows[0].id });
  } catch(e) { res.status(500).json({ error: 'Upload failed' }); }
});

app.delete('/api/admin/nightlife-photos/:id', async (req, res) => {
  if (!req.session || !req.session.admin) return res.status(401).json({ error: 'Unauthorized' });
  try { await pool.query('DELETE FROM nightlife_photos WHERE id = $1', [req.params.id]); res.json({ success: true }); }
  catch(e) { res.status(500).json({ error: 'Delete failed' }); }
});

app.put('/api/admin/nightlife-photos/:id', async (req, res) => {
  if (!req.session || !req.session.admin) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { caption, sort_order } = req.body;
    await pool.query('UPDATE nightlife_photos SET caption = $1, sort_order = $2 WHERE id = $3',
      [caption || '', parseInt(sort_order) || 0, req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Update failed' }); }
});

'''

listen = re.search(r'app\.listen\(', s)
if listen:
    s = s[:listen.start()] + api + s[listen.start():]
    changes += 1
    print('[3] Added API endpoints')

with open(path, 'w') as f:
    f.write(s)
print(f'DONE Part 2 - {changes} changes')

# 4. Add multer to package.json
pkg_path = os.path.expanduser('~/temp-deploy/package.json')
with open(pkg_path) as f:
    pkg = f.read()
if '"multer"' not in pkg:
    m = re.search(r'"dependencies"\s*:\s*\{', pkg)
    if m:
        pkg = pkg[:m.end()] + '\n    "multer": "^1.4.5-lts.1",' + pkg[m.end():]
        with open(pkg_path, 'w') as f:
            f.write(pkg)
        print('[4] Added multer to package.json')
print('DONE Part 2 complete')
