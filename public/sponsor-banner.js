/**
 * NorthBound Sponsor Banner — Inline Header Version
 * Renders sponsor logos inside the nav bar, between logo and nav links.
 * Single sponsor: centred. Multiple: row with separators.
 * Fully responsive — scales down on tablet, logo-only on mobile.
 */
(function () {
  'use strict';

  var css = '\
#nav-sponsor {\
  display: flex;\
  align-items: center;\
  gap: 10px;\
  margin: 0 auto;\
  padding: 0 20px;\
  max-width: 380px;\
  overflow: hidden;\
  flex-shrink: 1;\
  min-width: 0;\
}\
\
#nav-sponsor-label {\
  flex-shrink: 0;\
  font-family: "Segoe UI", system-ui, sans-serif;\
  font-size: 0.55rem;\
  font-weight: 700;\
  letter-spacing: 0.15em;\
  text-transform: uppercase;\
  color: rgba(200,151,78,0.6);\
  white-space: nowrap;\
}\
\
#nav-sponsor-logos {\
  display: flex;\
  align-items: center;\
  gap: 16px;\
  overflow: hidden;\
  min-width: 0;\
}\
\
#nav-sponsor-logos a {\
  display: flex;\
  align-items: center;\
  flex-shrink: 0;\
}\
\
#nav-sponsor-logos img {\
  height: 38px;\
  width: auto;\
  max-width: 220px;\
  object-fit: contain;\
  opacity: 0.9;\
  transition: opacity 0.2s;\
}\
\
#nav-sponsor-logos img:hover {\
  opacity: 1;\
}\
\
.nav-sponsor-sep {\
  width: 1px;\
  height: 18px;\
  background: rgba(200,151,78,0.22);\
  flex-shrink: 0;\
}\
\
@media (max-width: 1100px) {\
  #nav-sponsor { max-width: 280px; gap: 8px; padding: 0 12px; }\
  #nav-sponsor-logos img { height: 30px; max-width: 160px; }\
  #nav-sponsor-label { font-size: 0.48rem; }\
}\
\
@media (max-width: 640px) {\
  #nav-sponsor { max-width: 140px; padding: 0 6px; gap: 4px; }\
  #nav-sponsor-label { display: none; }\
  #nav-sponsor-logos img { height: 22px; max-width: 110px; }\
}\
';

  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  function makeImg(b) {
    var img = document.createElement('img');
    img.src = '/banners/' + b.filename;
    img.alt = 'Sponsor';
    img.loading = 'lazy';
    if (b.url) {
      var a = document.createElement('a');
      a.href = b.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.appendChild(img);
      return a;
    }
    return img;
  }

  function renderLogos(container, banners) {
    var logos = document.createElement('div');
    logos.id = 'nav-sponsor-logos';
    banners.forEach(function (b, i) {
      if (i > 0) {
        var sep = document.createElement('div');
        sep.className = 'nav-sponsor-sep';
        logos.appendChild(sep);
      }
      logos.appendChild(makeImg(b));
    });
    container.appendChild(logos);
  }

  function loadBanners() {
    fetch('/api/banners')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!Array.isArray(data) || data.length === 0) return;

        var navInner = document.querySelector('.nav-inner');
        var navLinks = document.querySelector('.nav-links') || document.querySelector('.mobile-toggle');
        if (!navInner || !navLinks) return;

        var wrap = document.createElement('div');
        wrap.id = 'nav-sponsor';

        var label = document.createElement('span');
        label.id = 'nav-sponsor-label';
        label.textContent = 'Sponsored by';
        wrap.appendChild(label);

        renderLogos(wrap, data);

        navInner.insertBefore(wrap, navLinks);
      })
      .catch(function () { /* no sponsors shown */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadBanners);
  } else {
    loadBanners();
  }
})();
