#!/usr/bin/env python3
"""Fix: Move nightlife API routes BEFORE the catch-all app.get('*') route."""
import os, re

path = os.path.expanduser('~/temp-deploy/server.js')
with open(path) as f:
    s = f.read()

# Find the catch-all route: app.get('*', ...) that serves index.html
catchall = re.search(r"app\.get\('\*'", s)
if not catchall:
    # Try alternate patterns
    catchall = re.search(r'app\.get\("\*"', s)
if not catchall:
    catchall = re.search(r"app\.get\(\s*['\"]\/\*['\"]", s)

if not catchall:
    print('No catch-all route found - checking for other patterns...')
    # Look for sendFile index.html pattern
    catchall = re.search(r"app\.get\([^)]*,\s*[^)]*index\.html", s)

if catchall:
    print(f'Found catch-all at position {catchall.start()}')

    # Find the nightlife API block
    api_start = s.find('// Nightlife Photos API')
    if api_start == -1:
        api_start = s.find("app.get('/api/nightlife-photos'")

    if api_start != -1 and api_start > catchall.start():
        # Find the end of the API block (look for app.listen or end of the block)
        # The API block ends just before app.listen
        listen = re.search(r'app\.listen\(', s[api_start:])
        if listen:
            api_end = api_start + listen.start()
        else:
            api_end = len(s)

        api_block = s[api_start:api_end].rstrip()

        # Remove the API block from its current position
        s = s[:api_start] + s[api_end:]

        # Re-find the catch-all (position may have shifted)
        catchall2 = re.search(r"app\.get\('\*'", s)
        if not catchall2:
            catchall2 = re.search(r'app\.get\("\*"', s)
        if not catchall2:
            catchall2 = re.search(r"app\.get\([^)]*,\s*[^)]*index\.html", s)

        if catchall2:
            # Insert API block BEFORE the catch-all
            s = s[:catchall2.start()] + api_block + '\n\n' + s[catchall2.start():]
            print('Moved API routes BEFORE catch-all')
        else:
            print('ERROR: Lost catch-all after extraction')
    elif api_start != -1 and api_start < catchall.start():
        print('API routes already BEFORE catch-all - no fix needed')
    else:
        print('API routes not found')
else:
    print('No catch-all route pattern found in server.js')
    # Let's just check if API routes exist at all
    if "app.get('/api/nightlife-photos'" in s:
        print('API routes exist but no catch-all found - routes should work')
    else:
        print('ERROR: No API routes found at all')

with open(path, 'w') as f:
    f.write(s)
print('DONE')
