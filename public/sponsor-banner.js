/**
 * NorthBound Sponsor Banner — Floating Sidebar Carousel
 * Include this script before </body> in index.html
 * Fetches active banners from /api/banners and auto-rotates them
 */
(function () {
  'use strict';

  const ROTATE_MS = 5000; // ms between banner transitions
  const MIN_BANNERS = 1;

  // ── Styles ──────────────────────────────────────────────────────────────────
  const css = `
    #nb-sponsor-sidebar {
      position: fixed;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      z-index: 999;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0;
    }

    #nb-sponsor-toggle {
      writing-mode: vertical-rl;
      text-orientation: mixed;
      background: #C8974E;
      color: #0a0a0f;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 0.85rem 0.45rem;
      border-radius: 8px 0 0 8px;
      cursor: pointer;
      border: none;
      user-select: none;
      transition: background 0.2s;
      flex-shrink: 0;
      align-self: flex-end;
    }
    #nb-sponsor-toggle:hover { background: #d9a85e; }

    #nb-sponsor-panel {
      background: #111118;
      border: 1px solid rgba(200,151,78,0.25);
      border-right: none;
      border-radius: 12px 0 0 12px;
      overflow: hidden;
      width: 160px;
      transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1),
                  opacity 0.3s ease;
      opacity: 1;
    }
    #nb-sponsor-panel.collapsed {
      width: 0;
      opacity: 0;
      border-width: 0;
    }

    #nb-sponsor-inner {
      width: 160px;
      padding: 0.75rem 0.65rem 0.65rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.55rem;
    }

    .nb-sponsor-label {
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 0.6rem;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #555;
      text-align: center;
    }

    #nb-banner-wrap {
      position: relative;
      width: 128px;
      height: 256px;
      overflow: hidden;
      border-radius: 8px;
      background: #0d0d14;
    }

    .nb-banner-slide {
      position: absolute;
      inset: 0;
      opacity: 0;
      transition: opacity 0.6s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .nb-banner-slide.visible { opacity: 1; }

    .nb-banner-slide a {
      display: block;
      width: 100%;
      height: 100%;
    }
    .nb-banner-slide img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    #nb-banner-dots {
      display: flex;
      gap: 4px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .nb-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #333;
      transition: background 0.2s;
      cursor: pointer;
      border: none;
      padding: 0;
    }
    .nb-dot.active { background: #C8974E; }

    /* Mobile: hide on very small screens to avoid blocking content */
    @media (max-width: 480px) {
      #nb-sponsor-sidebar { display: none; }
    }
  `;

  // ── Inject CSS ───────────────────────────────────────────────────────────────
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ── Build DOM ────────────────────────────────────────────────────────────────
  const sidebar = document.createElement('div');
  sidebar.id = 'nb-sponsor-sidebar';

  const panel = document.createElement('div');
  panel.id = 'nb-sponsor-panel';

  const inner = document.createElement('div');
  inner.id = 'nb-sponsor-inner';

  const label = document.createElement('div');
  label.className = 'nb-sponsor-label';
  label.textContent = 'Sponsors';

  const bannerWrap = document.createElement('div');
  bannerWrap.id = 'nb-banner-wrap';

  const dotsEl = document.createElement('div');
  dotsEl.id = 'nb-banner-dots';

  inner.appendChild(label);
  inner.appendChild(bannerWrap);
  inner.appendChild(dotsEl);
  panel.appendChild(inner);

  const toggle = document.createElement('button');
  toggle.id = 'nb-sponsor-toggle';
  toggle.textContent = 'Sponsors';
  toggle.setAttribute('aria-label', 'Toggle sponsor banners');

  sidebar.appendChild(panel);
  sidebar.appendChild(toggle);
  document.body.appendChild(sidebar);

  // ── Toggle collapse ──────────────────────────────────────────────────────────
  let collapsed = false;
  toggle.addEventListener('click', function () {
    collapsed = !collapsed;
    panel.classList.toggle('collapsed', collapsed);
    toggle.textContent = collapsed ? '►' : 'Sponsors';
  });

  // ── Carousel logic ───────────────────────────────────────────────────────────
  let banners = [];
  let current = 0;
  let timer = null;
  let slides = [];
  let dots = [];

  function buildSlides() {
    bannerWrap.innerHTML = '';
    dotsEl.innerHTML = '';
    slides = [];
    dots = [];

    banners.forEach(function (b, i) {
      const slide = document.createElement('div');
      slide.className = 'nb-banner-slide' + (i === 0 ? ' visible' : '');

      const content = b.url
        ? (() => {
            const a = document.createElement('a');
            a.href = b.url;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            const img = document.createElement('img');
            img.src = '/banners/' + b.filename;
            img.alt = 'Sponsor';
            a.appendChild(img);
            return a;
          })()
        : (() => {
            const img = document.createElement('img');
            img.src = '/banners/' + b.filename;
            img.alt = 'Sponsor';
            return img;
          })();

      slide.appendChild(content);
      bannerWrap.appendChild(slide);
      slides.push(slide);

      if (banners.length > 1) {
        const dot = document.createElement('button');
        dot.className = 'nb-dot' + (i === 0 ? ' active' : '');
        dot.setAttribute('aria-label', 'Banner ' + (i + 1));
        dot.addEventListener('click', function () { goTo(i); resetTimer(); });
        dotsEl.appendChild(dot);
        dots.push(dot);
      }
    });
  }

  function goTo(index) {
    if (!slides.length) return;
    slides[current].classList.remove('visible');
    if (dots[current]) dots[current].classList.remove('active');
    current = (index + slides.length) % slides.length;
    slides[current].classList.add('visible');
    if (dots[current]) dots[current].classList.add('active');
  }

  function resetTimer() {
    if (timer) clearInterval(timer);
    if (banners.length > 1) {
      timer = setInterval(function () { goTo(current + 1); }, ROTATE_MS);
    }
  }

  function loadBanners() {
    fetch('/api/banners')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!Array.isArray(data) || data.length < MIN_BANNERS) {
          sidebar.style.display = 'none';
          return;
        }
        banners = data;
        current = 0;
        sidebar.style.display = '';
        buildSlides();
        resetTimer();
      })
      .catch(function () {
        sidebar.style.display = 'none';
      });
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadBanners);
  } else {
    loadBanners();
  }
})();
