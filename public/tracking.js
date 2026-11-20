/* NorthBound Weekends — analytics + ad pixel (GA4 + Meta Pixel)
 * GA4 property: G-LNHYKVQ8YQ   Meta Pixel: 1139346938744071
 *
 * Funnel (GA4 / Meta), all Stripe:
 *   view_item / ViewContent -> add_to_cart / AddToCart -> begin_checkout / InitiateCheckout
 *   -> add_payment_info / AddPaymentInfo -> purchase / Purchase (/booking-success.html)
 * Main-site booking modal fires these via NBTrack calls in index.html; the Stripe event pages
 * (/benny-benassi, /sync-fest) are instrumented below.
 */
(function (w, d) {
  'use strict';
  var GA_ID = 'G-LNHYKVQ8YQ';
  var PIXEL_ID = '1139346938744071';
  var CURRENCY = 'USD';
  var EVENTS = {
    'benny-benassi': 'Benny Benassi Party Weekend',
    'sync-fest': 'SYNC Festival Weekend'
  };

  // ── GA4 base ────────────────────────────────────────────────────
  w.dataLayer = w.dataLayer || [];
  w.gtag = function () { w.dataLayer.push(arguments); };
  w.gtag('js', new Date());
  w.gtag('config', GA_ID);
  var g = d.createElement('script');
  g.async = true;
  g.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  d.head.appendChild(g);

  // ── Meta Pixel base ─────────────────────────────────────────────
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
    t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  }(w, d, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  w.fbq('init', PIXEL_ID);
  w.fbq('track', 'PageView');

  // ── Helpers ─────────────────────────────────────────────────────
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function num(n) { n = parseFloat(n); return isFinite(n) ? Math.round(n * 100) / 100 : 0; }

  // Same math as checkout: package + MAT 6% + HST 13% on (package+MAT) + admin fee $2/$3/$4 for groups of 2/3/4
  function charges(base, guests) {
    base = parseFloat(base) || 0;
    var mat = Math.round(base * 6) / 100;
    var hst = Math.round((base + mat) * 13) / 100;
    var adm = { '2': 2, '3': 3, '4': 4 }[String(guests)] || 0;
    return { total: num(base + mat + hst + adm), tax: num(mat + hst) };
  }

  function itemId(sel) { return sel.id || slug(sel.packageName); }

  function gaItems(sel) {
    return [{
      item_id: itemId(sel),
      item_name: sel.weekend || sel.packageName,
      item_category: 'Weekend Trip',
      item_variant: sel.packageName,
      price: num(sel.price),
      quantity: 1
    }];
  }

  function metaData(sel) {
    var m = {
      content_type: 'product',
      content_ids: [itemId(sel)],
      content_name: (sel.weekend || '') + (sel.packageName ? ' — ' + sel.packageName : ''),
      content_category: 'Weekend Trip',
      currency: CURRENCY
    };
    if (sel.value) { m.value = num(sel.value); m.num_items = 1; m.contents = [{ id: itemId(sel), quantity: 1, item_price: num(sel.price) }]; }
    return m;
  }

  function ga(name, sel, extra) {
    var p = { currency: CURRENCY, items: gaItems(sel) };
    if (sel.value) p.value = num(sel.value);
    if (sel.travelers) p.travelers = parseInt(sel.travelers, 10) || 1;
    for (var k in (extra || {})) p[k] = extra[k];
    w.gtag('event', name, p);
  }

  function fb(name, sel, opts) {
    if (opts && opts.eventID) w.fbq('track', name, metaData(sel), { eventID: opts.eventID });
    else w.fbq('track', name, metaData(sel));
  }

  // sel = { id?, weekend, packageName, price, value (total incl. tax/fees), travelers }
  var NB = w.NBTrack = {
    viewItem: function (sel) { ga('view_item', sel); fb('ViewContent', sel); },
    addToCart: function (sel) { ga('add_to_cart', sel); fb('AddToCart', sel); },
    beginCheckout: function (sel, extra) { ga('begin_checkout', sel, extra); fb('InitiateCheckout', sel); },
    addPaymentInfo: function (sel) { ga('add_payment_info', sel, { payment_type: 'stripe_checkout' }); fb('AddPaymentInfo', sel); },

    // Fired once per paid Stripe session on /booking-success.html (data from /api/checkout-session)
    purchase: function (data) {
      var key = 'nb_purchase_' + data.transaction_id;
      try { if (w.localStorage.getItem(key)) return; } catch (e) {}
      var sel = {
        id: data.id, weekend: data.weekend, packageName: data.packageName, price: data.packagePrice,
        value: data.value, travelers: data.travelers
      };
      ga('purchase', sel, { transaction_id: data.transaction_id, tax: num(data.tax), currency: (data.currency || CURRENCY) });
      // eventID = Stripe session id so a future server-side (CAPI) Purchase dedupes against this one
      fb('Purchase', sel, { eventID: data.transaction_id });
      try { w.localStorage.setItem(key, '1'); } catch (e) {}
    }
  };

  // ── Page-level funnel hooks ─────────────────────────────────────
  function ready(fn) { if (d.readyState !== 'loading') fn(); else d.addEventListener('DOMContentLoaded', fn); }

  ready(function () {
    var path = (w.location.pathname || '/').replace(/\/+$/, '').replace(/\.html$/, '');
    var evSlug = path.replace(/^\//, '');

    // Main page: the booking modal in index.html fires the funnel events
    if (path === '' || path === '/index') return;

    // Stripe event pages: single form, package cards, POST /api/book/<slug>
    var form = d.getElementById('bookingForm');
    if (EVENTS[evSlug] && form) {
      var selFn = function () {
        var guests = parseInt((d.getElementById('pkgInput') || {}).value, 10) || 2;
        var card = d.querySelector('.pkg.selected');
        var price = card ? parseFloat(card.getAttribute('data-price')) : 0;
        return {
          id: evSlug + '-' + guests + '-guests', weekend: EVENTS[evSlug], packageName: guests + '-guest package',
          price: price, value: charges(price, guests).total, travelers: guests
        };
      };
      NB.viewItem(selFn());
      var carted = false;
      var cart = function () { if (!carted) { carted = true; NB.addToCart(selFn()); } };
      d.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.pkg')) setTimeout(function () { carted = false; cart(); }, 0); }, true);
      form.addEventListener('focusin', cart);
      form.addEventListener('submit', function () {
        var s = selFn(); cart();
        NB.beginCheckout(s); NB.addPaymentInfo(s);
      });
    }
  });
})(window, document);
