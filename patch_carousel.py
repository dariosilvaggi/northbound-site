#!/usr/bin/env python3
"""Move nightlife carousel from nav into hero-content, between CTAs and hero-tag."""
import os

FILE = os.path.expanduser('~/temp-deploy/public/index.html')

with open(FILE, 'r') as f:
    s = f.read()

original = s

# ── Step 1: Remove carousel HTML from inside the nav ──
nav_carousel = '''    <div class="nightlife-carousel-wrapper" id="nightlifeCarousel">
      <div class="nightlife-carousel" id="carouselTrack"></div>
      <div class="carousel-dots" id="carouselDots"></div>
    </div>'''

pos = s.find(nav_carousel)
if pos == -1:
    # Try with slightly different indentation
    nav_carousel = '<div class="nightlife-carousel-wrapper" id="nightlifeCarousel">'
    pos = s.find(nav_carousel)
    if pos == -1:
        print("ERROR: Could not find carousel HTML in nav")
        exit(1)
    # Find the closing </div> for the wrapper
    end = s.find('</div>', s.find('carouselDots', pos))
    end = s.find('</div>', end + 6) + 6  # close wrapper div
    # Remove with surrounding whitespace
    line_start = s.rfind('\n', 0, pos)
    line_end = s.find('\n', end)
    s = s[:line_start] + s[line_end:]
    print("[1] Removed carousel from nav (flexible match)")
else:
    s = s.replace(nav_carousel, '')
    print("[1] Removed carousel from nav (exact match)")

# ── Step 2: Insert carousel into hero-content after hero-ctas ──
# Find the closing </div> of hero-ctas
ctas_marker = '<div class="hero-ctas">'
ctas_pos = s.find(ctas_marker)
if ctas_pos == -1:
    print("ERROR: Could not find hero-ctas")
    exit(1)

# Find the closing </div> for hero-ctas
# Count opening and closing divs to find the matching close
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

# Insert carousel HTML after hero-ctas closing div
carousel_html = '''
      <div class="nightlife-carousel-wrapper" id="nightlifeCarousel" style="order:5;">
        <div class="nightlife-carousel" id="carouselTrack"></div>
        <div class="carousel-dots" id="carouselDots"></div>
      </div>'''

s = s[:ctas_end] + carousel_html + s[ctas_end:]
print("[2] Inserted carousel after hero-ctas")

# ── Step 3: Update CSS - make carousel full-width in hero ──
old_css = '.nightlife-carousel-wrapper{width:100%;max-width:700px;margin:2rem auto;position:relative;overflow:hidden;border-radius:12px;}'
new_css = '.nightlife-carousel-wrapper{width:100%;max-width:100%;margin:1.5rem 0;position:relative;overflow:hidden;border-radius:12px;order:5;}'

if s.find(old_css) != -1:
    s = s.replace(old_css, new_css)
    print("[3] Updated carousel CSS to full-width")
else:
    print("[3] WARN: Could not find exact CSS to replace, checking alternatives...")
    # Try to find and replace any max-width setting
    alt = 'max-width:700px'
    if s.find(alt) != -1:
        s = s.replace('max-width:700px', 'max-width:100%', 1)
        print("[3] Replaced max-width:700px with 100%")
    else:
        print("[3] SKIP: CSS may already be correct")

# ── Step 4: Update mobile CSS ──
old_mobile = '@media(max-width:768px){.nightlife-carousel-wrapper{max-width:100%;margin:1.5rem auto;border-radius:8px;}'
new_mobile = '@media(max-width:768px){.nightlife-carousel-wrapper{max-width:100%;margin:1rem 0;border-radius:8px;}'
if s.find(old_mobile) != -1:
    s = s.replace(old_mobile, new_mobile)
    print("[4] Updated mobile CSS")
else:
    print("[4] SKIP: Mobile CSS not found or already correct")

# ── Verify ──
if s.find('id="nightlifeCarousel"') == -1:
    print("ERROR: Carousel HTML missing after patch!")
    exit(1)

# Check it's inside hero now
hero_pos = s.find('class="hero"')
nav_end = s.find('</nav>')
carousel_pos = s.find('id="nightlifeCarousel"')

if carousel_pos > nav_end:
    print("[OK] Carousel is after </nav> (in hero section)")
else:
    print("WARN: Carousel may still be in nav")

with open(FILE, 'w') as f:
    f.write(s)

print(f"\nDONE - {FILE} patched")
print(f"  Original: {len(original)} chars")
print(f"  Patched:  {len(s)} chars")
