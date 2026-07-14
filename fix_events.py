#!/usr/bin/env python3
"""Fix: Remove Mystic Garden, add Benny Benassi + SYNC Festival cards, add server routes."""
import os, re, urllib.request

PUBLIC = os.path.expanduser('~/temp-deploy/public')
INDEX = os.path.join(PUBLIC, 'index.html')
SERVER = os.path.expanduser('~/temp-deploy/server.js')

# ── Step 0: Ensure banner images exist ──
bb_img = os.path.join(PUBLIC, 'benny-benassi-banner.jpg')
sf_img = os.path.join(PUBLIC, 'sync-fest-banner.png')
if not os.path.exists(bb_img):
    print("[0a] Downloading benny-benassi-banner.jpg...")
    urllib.request.urlretrieve(
        'https://cdn.uploads.webconnex.com/191761/52p_aug8_bennybenassi__event%20%281%29.jpg', bb_img)
else:
    print("[0a] benny-benassi-banner.jpg already exists")
if not os.path.exists(sf_img):
    print("[0b] Downloading sync-fest-banner.png...")
    urllib.request.urlretrieve('https://sync-fest.com/Reference/syncpreview.png', sf_img)
else:
    print("[0b] sync-fest-banner.png already exists")

# ── Step 1: Remove Mystic Garden from index.html ──
with open(INDEX, 'r') as f:
    html = f.read()
orig_len = len(html)

# Remove the featured-event div using regex (handles nested divs)
# Find the opening tag
start = html.find('<div class="featured-event"')
if start == -1:
    start = html.find("<div class='featured-event'")
if start != -1:
    depth = 0
    i = start
    while i < len(html):
        if html[i:i+4] == '<div':
            depth += 1
        elif html[i:i+6] == '</div>':
            depth -= 1
            if depth == 0:
                end = i + 6
                html = html[:start] + html[end:]
                print(f"[1] Removed Mystic Garden HTML ({end - start} chars)")
                break
        i += 1
else:
    print("[1] No featured-event div found (may already be removed)")

# Remove Mystic Garden CSS blocks
for marker in ['/* Featured Event */', '/* Featured Event Image */']:
    pos = html.find(marker)
    if pos != -1:
        # Find the next CSS comment or </style>
        next_comment = html.find('\n/*', pos + 10)
        next_style = html.find('</style>', pos)
        if next_comment != -1 and next_comment < next_style:
            html = html[:pos] + html[next_comment:]
        else:
            html = html[:pos] + html[next_style:]
        print(f"[2] Removed CSS block: {marker}")

# Also remove any existing featured-events-section (in case Part 1 partially ran)
fe_start = html.find('<div class="featured-events-section"')
if fe_start != -1:
    depth = 0
    i = fe_start
    while i < len(html):
        if html[i:i+4] == '<div':
            depth += 1
        elif html[i:i+6] == '</div>':
            depth -= 1
            if depth == 0:
                html = html[:fe_start] + html[i+6:]
                print("[2b] Removed existing featured-events-section (partial Part 1)")
                break
        i += 1

# ── Step 2: Insert new event cards after hero-ctas ──
cta_start = html.find('<div class="hero-ctas">')
if cta_start == -1:
    cta_start = html.find("<div class='hero-ctas'>")
if cta_start != -1:
    depth = 0
    i = cta_start
    while i < len(html):
        if html[i:i+4] == '<div':
            depth += 1
        elif html[i:i+6] == '</div>':
            depth -= 1
            if depth == 0:
                insert_pos = i + 6
                break
        i += 1

    cards = '''
      <div class="featured-events-section" style="order:4;">
        <div class="featured-events-badge">FEATURED EVENTS</div>
        <div class="featured-events-grid">
          <div class="feat-event-card">
            <div class="feat-event-img"><img src="/benny-benassi-banner.jpg" alt="Benny Benassi Live in Windsor"></div>
            <div class="feat-event-body">
              <h3 class="feat-event-name">Benny Benassi Party Weekend</h3>
              <div class="feat-event-meta"><span class="feat-event-date">Aug 8, 2026</span><span class="feat-sep">&middot;</span><span>Windsor, ON</span><span class="feat-sep">&middot;</span><span class="feat-event-date">19+</span></div>
              <p class="feat-event-desc">Concert + after-party + hotel. The king of electro-house headlines Windsor.</p>
              <div class="feat-event-price">From <strong>$399</strong> <span>/ 2 guests</span></div>
              <a href="/benny-benassi" class="feat-event-btn">View Packages &rarr;</a>
            </div>
          </div>
          <div class="feat-event-card">
            <div class="feat-event-img"><img src="/sync-fest-banner.png" alt="SYNC Festival 2026"></div>
            <div class="feat-event-body">
              <h3 class="feat-event-name">SYNC Festival Weekend</h3>
              <div class="feat-event-meta"><span class="feat-event-date">Jul 17&ndash;18, 2026</span><span class="feat-sep">&middot;</span><span>Windsor, ON</span><span class="feat-sep">&middot;</span><span class="feat-event-date">19+</span></div>
              <p class="feat-event-desc">Full 2-day festival + both after-parties + hotel. Two days. One frequency.</p>
              <div class="feat-event-price">From <strong>$399</strong> <span>/ 2 guests</span></div>
              <a href="/sync-fest" class="feat-event-btn">View Packages &rarr;</a>
            </div>
          </div>
        </div>
      </div>'''
    html = html[:insert_pos] + cards + html[insert_pos:]
    print("[3] Inserted new event cards after hero-ctas")
else:
    print("[3] ERROR: Could not find hero-ctas div!")

# ── Step 3: Add CSS ──
css_block = '''
/* Featured Events Section */
.featured-events-section{width:100%;margin:1.5rem 0 .5rem;order:4;text-align:center;}
.featured-events-badge{display:inline-block;background:linear-gradient(135deg,#d4a853,#f0d68a,#d4a853);color:#0a0a14;font-size:.7rem;font-weight:800;letter-spacing:.15em;padding:4px 16px;border-radius:20px;margin-bottom:14px;text-transform:uppercase;}
.featured-events-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.feat-event-card{background:linear-gradient(145deg,rgba(212,168,83,.08),rgba(212,168,83,.02));border:1px solid rgba(212,168,83,.2);border-radius:14px;overflow:hidden;text-align:left;transition:transform .3s,box-shadow .3s;}
.feat-event-card:hover{transform:translateY(-3px);box-shadow:0 8px 25px rgba(212,168,83,.15);}
.feat-event-img{width:100%;height:160px;overflow:hidden;}
.feat-event-img img{width:100%;height:100%;object-fit:cover;}
.feat-event-body{padding:18px 16px 20px;}
.feat-event-name{font-family:'Playfair Display',Georgia,serif;font-size:1.15rem;font-weight:700;color:#fff;margin:0 0 8px;line-height:1.25;}
.feat-event-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:.78rem;color:rgba(255,255,255,.6);margin-bottom:10px;}
.feat-event-date{color:#d4a853;font-weight:600;}
.feat-sep{color:rgba(255,255,255,.25);}
.feat-event-desc{font-size:.8rem;color:rgba(255,255,255,.55);margin:0 0 12px;line-height:1.45;}
.feat-event-price{font-size:.85rem;color:rgba(255,255,255,.7);margin-bottom:14px;}
.feat-event-price strong{color:#d4a853;font-size:1.1rem;}
.feat-event-price span{font-size:.75rem;color:rgba(255,255,255,.4);}
.feat-event-btn{display:inline-block;background:linear-gradient(135deg,#d4a853,#c49843);color:#0a0a14;font-weight:700;font-size:.85rem;padding:10px 28px;border-radius:8px;text-decoration:none;transition:all .3s;box-shadow:0 3px 12px rgba(212,168,83,.25);}
.feat-event-btn:hover{background:linear-gradient(135deg,#e0b863,#d4a853);transform:translateY(-1px);box-shadow:0 5px 18px rgba(212,168,83,.4);}
@media(max-width:768px){.featured-events-grid{grid-template-columns:1fr;}.feat-event-name{font-size:1.05rem;}.feat-event-img{height:140px;}}
'''

# Remove any existing featured-events CSS
if '/* Featured Events Section */' in html:
    cs = html.find('/* Featured Events Section */')
    ce = html.find('\n/*', cs + 10)
    if ce == -1 or ce > html.find('</style>', cs):
        ce = html.find('</style>', cs)
    html = html[:cs] + html[ce:]
    print("[4a] Removed existing Featured Events CSS")

style_end = html.rfind('</style>')
if style_end != -1:
    html = html[:style_end] + css_block + html[style_end:]
    print("[4] Added new CSS")

with open(INDEX, 'w') as f:
    f.write(html)
print(f"[OK] index.html: {orig_len} -> {len(html)} chars")

# ── Step 4: Remove old Mystic Garden image ──
mg_img = os.path.join(PUBLIC, 'mystic-garden-banner.jpg')
if os.path.exists(mg_img):
    os.remove(mg_img)
    print("[5] Removed mystic-garden-banner.jpg")

# ── Step 5: Add server routes ──
with open(SERVER, 'r') as f:
    srv = f.read()

# Only add routes if not already present
if '/benny-benassi' not in srv:
    ca = srv.find("app.get('*'")
    if ca == -1:
        ca = srv.find('app.get("*"')
    if ca != -1:
        routes = '''
// Special Event Booking Pages
app.get('/benny-benassi', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'benny-benassi.html'));
});
app.get('/sync-fest', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sync-fest.html'));
});

// Special Event Booking API
const eventPricing = { 'benny-benassi': {2:399,3:499,4:619}, 'sync-fest': {2:399,3:499,4:619} };
app.post('/api/book/:event', express.urlencoded({extended:true}), async (req, res) => {
  try {
    const {event} = req.params;
    const {package:pkg, firstName, lastName, email, phone} = req.body;
    const guests = parseInt(pkg);
    const pricing = eventPricing[event];
    if (!pricing || !pricing[guests]) return res.status(400).send('Invalid package');
    const amount = pricing[guests];
    const attendees = [];
    for (let i=1; i<=guests; i++) attendees.push({first:req.body['guest'+i+'First']||'',last:req.body['guest'+i+'Last']||''});
    const bookingsFile = path.join(__dirname, 'bookings.json');
    let bookings = [];
    try { bookings = JSON.parse(fs.readFileSync(bookingsFile,'utf8')); } catch(e){}
    const booking = {id:Date.now().toString(36)+Math.random().toString(36).substr(2,4),event,guests,amount,lead:{firstName,lastName,email,phone},attendees,status:'pending',createdAt:new Date().toISOString()};
    bookings.push(booking);
    fs.writeFileSync(bookingsFile, JSON.stringify(bookings,null,2));
    const name = event==='benny-benassi'?'Benny Benassi Party Weekend':'SYNC Festival Weekend';
    res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Booking Received</title><style>*{margin:0;padding:0;box-sizing:border-box;}body{background:#0a0a14;color:#fff;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:20px;}.card{max-width:500px;background:rgba(212,168,83,.06);border:1px solid rgba(212,168,83,.2);border-radius:16px;padding:40px 30px;}h1{color:#d4a853;font-size:1.6rem;margin-bottom:12px;}p{color:rgba(255,255,255,.7);font-size:.9rem;line-height:1.6;margin-bottom:16px;}.amount{font-size:1.3rem;color:#d4a853;font-weight:700;margin:8px 0;}.ref{font-size:.8rem;color:rgba(255,255,255,.4);}a{color:#d4a853;text-decoration:none;}</style></head><body><div class="card"><h1>Booking Received!</h1><p class="amount">$'+amount+' - '+guests+'-person package</p><p>Thank you, '+firstName+'! Your '+name+' booking has been received.</p><p>We will contact you at <strong>'+email+'</strong> with payment instructions shortly.</p><p class="ref">Ref: '+booking.id+'</p><br><a href="/">Back to NorthBound Weekends</a></div></body></html>');
    console.log('[BOOKING]', event, guests, 'guests', '$'+amount, email);
  } catch(e) { console.error('[BOOKING ERROR]', e.message); res.status(500).send('Booking error.'); }
});

'''
        srv = srv[:ca] + routes + srv[ca:]
        with open(SERVER, 'w') as f:
            f.write(srv)
        print("[6] Added server routes to server.js")
    else:
        print("[6] ERROR: Could not find catch-all route in server.js")
else:
    print("[6] Server routes already exist")

print("\n=== ALL DONE ===")
print("Now run: cd ~/temp-deploy && git add -A && git commit -m 'Fix: Replace Mystic Garden with Benny Benassi + SYNC Festival' && git push origin main")
