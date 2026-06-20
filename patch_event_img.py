#!/usr/bin/env python3
"""Add banner image to the featured event section."""
import os
import urllib.request

FILE = os.path.expanduser('~/temp-deploy/public/index.html')
IMG_URL = 'https://uploads.tickettailorassets.com/c_crop,dpr_1.0,h_606,q_100,w_1910,x_0,y_89/c_scale,w_1200,q_90/v1/production/userfiles/jedib63iobe8lakqtr9k.jpg'
IMG_PATH = os.path.expanduser('~/temp-deploy/public/mystic-garden-banner.jpg')

# ── Step 1: Download the banner image ──
print("[1] Downloading banner image...")
urllib.request.urlretrieve(IMG_URL, IMG_PATH)
size = os.path.getsize(IMG_PATH)
print(f"    Saved: {IMG_PATH} ({size} bytes)")

# ── Step 2: Add image to the featured event card ──
with open(FILE, 'r') as f:
    s = f.read()

original = s

# Insert image inside the featured-event-card, before featured-event-info
old_info = '<div class="featured-event-info">'
new_info = '''<div class="featured-event-img">
            <img src="/mystic-garden-banner.jpg" alt="Mystic Garden Music Festival 2026 - Lineup Poster" loading="lazy">
          </div>
          <div class="featured-event-info">'''

if old_info in s:
    s = s.replace(old_info, new_info, 1)
    print("[2] Added banner image to featured event card")
else:
    print("ERROR: Could not find featured-event-info div")
    exit(1)

# ── Step 3: Add image CSS ──
img_css = '''
/* Featured Event Image */
.featured-event-img{width:100%;margin-bottom:20px;border-radius:12px;overflow:hidden;}
.featured-event-img img{width:100%;height:auto;display:block;border-radius:12px;}
'''

style_close = s.rfind('</style>')
if style_close == -1:
    print("ERROR: Could not find </style>")
    exit(1)

s = s[:style_close] + img_css + s[style_close:]
print("[3] Added image CSS")

with open(FILE, 'w') as f:
    f.write(s)

print(f"\nDONE - Banner image added")
print(f"  Original: {len(original)} chars")
print(f"  Patched:  {len(s)} chars")
