/**
 * NorthBound Sponsor Banner — Horizontal Bar (below nav)
 * Full-width, responsive. Auto-positions under the fixed nav.
 * Single sponsor: centred display. Multiple sponsors: continuous ticker.
 */
(function () {
  'use strict';

  var BAR_HEIGHT_DESKTOP = 52;   // px — desktop bar height
  var BAR_HEIGHT_MOBILE  = 40;   // px — mobile bar height (≤768px)
  var TICKER_SPEED       = 60;   // px per second for ticker scroll

  // ── Styles ──────────────────────────────────────────────────────────────────
  var css = '\
#nb-sponsor-bar {\
  position: fixed;\
  left: 0;\
  right: 0;\
  width: 100%;\
  height: ' + BAR_HEIGHT_DESKTOP + 'px;\
  background: #0c0c12;\
  border-bottom: 1px solid rgba(200,151,78,0.35);\
  border-top: 1px solid rgba(200,151,78,0.15);\
  z-index: 999;\
  display: flex;\
  align-items: center;\
  overflow: hidden;\
  box-sizing: border-box;\
}\
\
#nb-sponsor-label {\
  flex-shrink: 0;\
  padding: 0 14px 0 18px;\
  font-family: "Segoe UI", system-ui, sans-serif;\
  font-size: 0.58rem;\
  font-weight: 700;\
  letter-spacing: 0.18em;\
  text-transform: uppercase;\
  color: #C8974E;\
  border-right: 1px solid rgba(200,151,78,0.25);\
  height: 100%;\
  display: flex;\
  align-items: center;\
  white-space: nowrap;\
}\
\
#nb-sponsor-track {\
  flex: 1;\
  height: 100%;\
  overflow: hidden;\
  position: relative;\
}\
\
#nb-banner-single {\
  width: 100%;\
  height: 100%;\
  display: flex;\
  align-items: center;\
  justify-content: center;\
}\
#nb-banner-single a { display: flex; align-items: center; height: 100%; }\
#nb-banner-single img {\
  max-height: 36px;\
  max-width: 260px;\
  object-fit: contain;\
}\
\
#nb-ticker-inner {\
  display: flex;\
  align-items: center;\
  height: 100%;\
  will-change: transform;\
  white-space: nowrap;\
}\
\
.nb-ticker-item {\
  display: inline-flex;\
  align-items: center;\
  padding: 0 40px;\
  height: 100%;\
  flex-shrink: 0;\
}\
.nb-ticker-item a { display: flex; align-items: center; }\
.nb-ticker-item img {\
  max-height: 36px;\
  max-width: 180px;\
  object-fit: contain;\
}\
\
.nb-ticker-sep {\
  display: inline-flex;\
  align-self: center;\
  width: 1px;\
  height: 22px;\
  background: rgba(200,151,78,0.22);\
  flex-shrink: 0;\
}\
\
@media (max-width: 768px) {\
  #nb-sponsor-bar { height: ' + BAR_HEIGHT_MOBILE + 'px; }\
  #nb-sponsor-label { font-size: 0.5rem; padding: 0 10px 0 12px; }\
  #nb-banner-single img { max-height: 26px; max-width: 160px; }\
  .nb-ticker-item { padding: 0 24px; }\
  .nb-ticker-item img { max-height: 26px; max-width: 130px; }\
}';

  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ── Build DOM ────────────────────────────────────────────────────────────────
  var bar = document.createElement('div');
  bar.id = 'nb-sponsor-bar';
  bar.style.display = 'none'; // hidden until banners confirmed

  var labelEl = document.createElement('div');
  labelEl.id = 'nb-sponsor-label';
  labelEl.textContent = 'Sponsors';

  var track = document.createElement('div');
  track.id = 'nb-sponsor-track';

  bar.appendChild(labelEl);
  bar.appendChild(track);
  document.body.appendChild(bar);

  // ── Position bar below nav & push page content down ──────────────────────────
  function getBarHeight() {
    return window.innerWidth <= 768 ? BAR_HEIGHT_MOBILE : BAR_HEIGHT_DESKTOP;
  }

  function positionBar() {
    if (bar.style.display === 'none') return;
    var nav = document.getElementById('nav') || document.querySelector('nav');
    var navH = nav ? nav.offsetHeight : 0;
    bar.style.top = navH + 'px';

    // Increase padding-top on the hero/first section so content isn't hidden behind bar
    var hero = document.getElementById('hero') || document.querySelector('section');
    if (hero) {
      if (!hero.dataset.nbOrigPad) {
        hero.dataset.nbOrigPad = parseInt(window.getComputedStyle(hero).paddingTop, 10) || 0;
      }
      var origPad = parseInt(hero.dataset.nbOrigPad, 10);
      hero.style.paddingTop = (origPad + getBarHeight()) + 'px';
    }
  }

  window.addEventListener('resize', positionBar);

  // ── Image/link helper ────────────────────────────────────────────────────────
  function makeContent(b, forTicker) {
    var img = document.createElement('img');
    img.src = '/banners/' + b.filename;
    img.alt = 'Sponsor';
    img.loading = 'lazy';

    var inner = img;
    if (b.url) {
      var a = document.createElement('a');
      a.href = b.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.appendChild(img);
      inner = a;
    }

    if (!forTicker) return inner;

    var item = document.createElement('div');
    item.className = 'nb-ticker-item';
    item.appendChild(inner);
    return item;
  }

  // ── Single-banner layout ─────────────────────────────────────────────────────
  function renderSingle(b) {
    var wrap = document.createElement('div');
    wrap.id = 'nb-banner-single';
    wrap.appendChild(makeContent(b, false));
    track.appendChild(wrap);
  }

  // ── Ticker layout for multiple banners ───────────────────────────────────────
  function renderTicker(banners) {
    var inner = document.createElement('div');
    inner.id = 'nb-ticker-inner';

    // Original set + duplicate for seamless loop
    var doubled = banners.concat(banners);
    doubled.forEach(function (b, i) {
      inner.appendChild(makeContent(b, true));
      // Separator between items (not after the last in each half)
      if ((i + 1) % banners.length !== 0) {
        var sep = document.createElement('div');
        sep.className = 'nb-ticker-sep';
        inner.appendChild(sep);
      }
    });

    track.appendChild(inner);

    // Measure one full pass width, then animate at constant px/s
    function startTicker() {
      var items = inner.querySelectorAll('.nb-ticker-item');
      if (!items.length) return;

      var halfWidth = 0;
      for (var i = 0; i < banners.length; i++) {
        halfWidth += items[i].offsetWidth;
      }
      var seps = inner.querySelectorAll('.nb-ticker-sep');
      var sepCount = Math.min(seps.length / 2, banners.length - 1);
      for (var j = 0; j < sepCount; j++) {
        halfWidth += seps[j].offsetWidth;
      }

      if (halfWidth === 0) { setTimeout(startTicker, 150); return; }

      var dur = (halfWidth / TICKER_SPEED).toFixed(2);
      var kfName = 'nb_tick_' + Date.now();
      var kfStyle = document.createElement('style');
      kfStyle.textContent = '@keyframes ' + kfName + ' { 0% { transform:translateX(0); } 100% { transform:translateX(-' + halfWidth + 'px); } }';
      document.head.appendChild(kfStyle);

      inner.style.animation = kfName + ' ' + dur + 's linear infinite';
    }

    setTimeout(startTicker, 120);
  }

  // ── Fetch banners & init ─────────────────────────────────────────────────────
  function loadBanners() {
    fetch('/api/banners')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!Array.isArray(data) || data.length === 0) {
          bar.style.display = 'none';
          return;
        }
        bar.style.display = '';
        if (data.length === 1) {
          renderSingle(data[0]);
        } else {
          renderTicker(data);
        }
        positionBar();
      })
      .catch(function () {
        bar.style.display = 'none';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadBanners);
  } else {
    loadBanners();
  }

})();
