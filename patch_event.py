#!/usr/bin/env python3
"""Add Featured Event section to NorthBound Weekends hero area."""
import os

FILE = os.path.expanduser('~/temp-deploy/public/index.html')

with open(FILE, 'r') as f:
    s = f.read()

original = s

# ── Step 1: Add Featured Event HTML after hero-ctas ──
# Find the closing </div> of hero-ctas
ctas_marker = '<div class="hero-ctas">'
ctas_pos = s.find(ctas_marker)
if ctas_pos == -1:
    print("ERROR: Could not find hero-ctas")
    exit(1)

# Find matching closing div
depth = 0
i = ctas_pos
while i < len(s):
    if s[i:i+4] == '<div':
        depth += 1
    elif s[i:i+6] == '</div>':
        depth -= 1
        if depth == 0:
            ctas_end = i + 6
            break
    i += 1

event_html = '''
      <div class="featured-event" style="order:4;">
        <div class="featured-event-badge">FEATURED EVENT</div>
        <div class="featured-event-card">
          <div class="featured-event-info">
            <h2 class="featured-event-title">Mystic Garden Music Festival 2026</h2>
            <div class="featured-event-details">
              <span class="featured-event-date">July 11–12, 2026</span>
              <span class="featured-event-sep">·</span>
              <span class="featured-event-venue">Lanspeary Park, Windsor</span>
              <span class="featured-event-sep">·</span>
              <span class="featured-event-age">19+</span>
            </div>
            <p class="featured-event-lineup">Izzy Vadim · Gettoblaster · Pretty Sweet · The Sponges · DirtyHappy · Metawav · MushroomCloud & more</p>
            <p class="featured-event-desc">Two days of music, immersive attractions, pool party, food vendors & the Mystic Market. One stage. One intimate crowd.</p>
            <a href="https://www.strideevents.com/events/mystic-gardens/2026/tickets" target="_blank" rel="noopener" class="featured-event-btn">
              Get Tickets →
            </a>
          </div>
        </div>
      </div>'''

s = s[:ctas_end] + event_html + s[ctas_end:]
print("[1] Inserted featured event HTML after hero-ctas")

# ── Step 2: Add CSS before </style> ──
event_css = '''
/* Featured Event */
.featured-event{width:100%;max-width:100%;margin:1.5rem 0 0.5rem;order:4;text-align:center;}
.featured-event-badge{display:inline-block;background:linear-gradient(135deg,#d4a853,#f0d68a,#d4a853);color:#0a0a14;font-size:.7rem;font-weight:800;letter-spacing:.15em;padding:4px 16px;border-radius:20px;margin-bottom:12px;text-transform:uppercase;}
.featured-event-card{background:linear-gradient(145deg,rgba(212,168,83,0.08),rgba(212,168,83,0.02));border:1px solid rgba(212,168,83,0.25);border-radius:16px;padding:28px 24px;position:relative;overflow:hidden;}
.featured-event-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#d4a853,transparent);}
.featured-event-info{position:relative;z-index:1;}
.featured-event-title{font-family:'Playfair Display',Georgia,serif;font-size:1.6rem;font-weight:700;color:#fff;margin:0 0 10px;line-height:1.2;}
.featured-event-details{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;font-size:.85rem;color:rgba(255,255,255,0.7);}
.featured-event-date{color:#d4a853;font-weight:600;}
.featured-event-sep{color:rgba(255,255,255,0.3);}
.featured-event-age{color:#d4a853;font-weight:600;}
.featured-event-venue{color:rgba(255,255,255,0.7);}
.featured-event-lineup{font-size:.8rem;color:rgba(255,255,255,0.55);margin:0 0 10px;line-height:1.5;letter-spacing:.02em;}
.featured-event-desc{font-size:.85rem;color:rgba(255,255,255,0.6);margin:0 0 18px;line-height:1.5;}
.featured-event-btn{display:inline-block;background:linear-gradient(135deg,#d4a853,#c49843);color:#0a0a14;font-weight:700;font-size:.95rem;padding:12px 36px;border-radius:8px;text-decoration:none;letter-spacing:.03em;transition:all .3s ease;box-shadow:0 4px 15px rgba(212,168,83,0.3);}
.featured-event-btn:hover{background:linear-gradient(135deg,#e0b863,#d4a853);transform:translateY(-2px);box-shadow:0 6px 20px rgba(212,168,83,0.45);}
@media(max-width:768px){.featured-event-title{font-size:1.3rem;}.featured-event-card{padding:20px 16px;}.featured-event-lineup{font-size:.75rem;}.featured-event-details{font-size:.78rem;}}
'''

# Find last </style> tag
style_close = s.rfind('</style>')
if style_close == -1:
    print("ERROR: Could not find </style>")
    exit(1)

s = s[:style_close] + event_css + s[style_close:]
print("[2] Added featured event CSS")

# ── Verify ──
if 'featured-event' in s and 'strideevents.com' in s:
    print("[OK] Featured event section verified")
else:
    print("ERROR: Verification failed")
    exit(1)

with open(FILE, 'w') as f:
    f.write(s)

print(f"\nDONE - {FILE} patched")
print(f"  Original: {len(original)} chars")
print(f"  Patched:  {len(s)} chars")
