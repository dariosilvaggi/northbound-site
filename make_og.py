#!/usr/bin/env python3
"""Create a 1200x630 Open Graph social preview image from logo.png."""
import os
try:
    from PIL import Image, ImageDraw
except ImportError:
    os.system('pip3 install Pillow')
    from PIL import Image, ImageDraw

LOGO = os.path.expanduser('~/temp-deploy/public/logo.png')
OUT = os.path.expanduser('~/temp-deploy/public/og-image.png')

# Create 1200x630 dark background
bg_color = (10, 10, 20)  # #0a0a14
og = Image.new('RGBA', (1200, 630), bg_color + (255,))

# Load logo
logo = Image.open(LOGO).convert('RGBA')
lw, lh = logo.size
print(f"Logo size: {lw}x{lh}")

# Scale logo to fit nicely (max 400px tall, centered)
max_h = 400
scale = min(max_h / lh, 800 / lw)
new_w = int(lw * scale)
new_h = int(lh * scale)
logo_resized = logo.resize((new_w, new_h), Image.LANCZOS)

# Center on background
x = (1200 - new_w) // 2
y = (630 - new_h) // 2

# Paste with alpha
og.paste(logo_resized, (x, y), logo_resized)

# Add subtle gold gradient bar at bottom
draw = ImageDraw.Draw(og)
gold = (212, 168, 83)  # #d4a853
draw.rectangle([0, 610, 1200, 630], fill=gold)

# Convert to RGB for PNG (no alpha needed for social)
og_rgb = og.convert('RGB')
og_rgb.save(OUT, 'PNG', optimize=True)
print(f"Saved: {OUT} ({os.path.getsize(OUT)} bytes)")

# Now update the OG meta tags in index.html
INDEX = os.path.expanduser('~/temp-deploy/public/index.html')
with open(INDEX, 'r') as f:
    html = f.read()

# Fix og:image URL to use www and point to og-image.png
old_og = 'content="https://northboundweekends.com/logo.png"'
new_og = 'content="https://www.northboundweekends.com/og-image.png"'
count = html.count(old_og)
html = html.replace(old_og, new_og)
print(f"Replaced og:image URL ({count} occurrences)")

# Also fix twitter:image
old_tw = '<meta name="twitter:image" content="https://northboundweekends.com/logo.png">'
new_tw = '<meta name="twitter:image" content="https://www.northboundweekends.com/og-image.png">'
if old_tw in html:
    html = html.replace(old_tw, new_tw)
    print("Fixed twitter:image URL")

with open(INDEX, 'w') as f:
    f.write(html)

print("\nDONE - og-image.png created and meta tags updated")
