/* ============================================================
   site.js — shared across index/car/blog/page/compare.html
   Loads /data/*.json (or GitHub raw URLs once deployed), injects
   SEO meta + JSON-LD, and renders the common header/footer.
   ============================================================ */

// If you deploy on GitHub Pages straight from the repo, relative
// paths below just work. DATA_BASE lets you point at raw.githubusercontent
// instead (useful if the site is hosted elsewhere but data lives in the repo).
const DATA_BASE = window.EV_DATA_BASE || 'data';

async function loadData(name) {
  const res = await fetch(`${DATA_BASE}/${name}.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Could not load ${name}.json`);
  return res.json();
}

async function loadAllData() {
  const [cars, blogs, pages, settings, categories] = await Promise.all([
    loadData('cars').catch(() => []),
    loadData('blogs').catch(() => []),
    loadData('pages').catch(() => []),
    loadData('settings').catch(() => ({})),
    loadData('categories').catch(() => ({ car: [], blog: [] })),
  ]);
  return { cars, blogs, pages, settings, categories };
}

// ---------- SEO injection ----------
function setMeta(name, content, attr = 'name') {
  if (!content) return;
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function injectSEO({ title, description, image, url, type = 'website' }) {
  if (title) document.title = title;
  setMeta('description', description);
  setMeta('og:title', title, 'property');
  setMeta('og:description', description, 'property');
  setMeta('og:type', type, 'property');
  setMeta('og:url', url || window.location.href, 'property');
  if (image) setMeta('og:image', image, 'property');
  setMeta('twitter:card', image ? 'summary_large_image' : 'summary');
  setMeta('twitter:title', title);
  setMeta('twitter:description', description);
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = url || window.location.href;
}

function injectJSONLD(obj) {
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(obj);
  document.head.appendChild(script);
}

function carProductSchema(car, settings) {
  const variants = carVariants(car);
  const prices = variants.map(v => Number(v.price)).filter(n => !isNaN(n));
  const offers = prices.length > 1
    ? { '@type': 'AggregateOffer', priceCurrency: 'INR', lowPrice: Math.min(...prices), highPrice: Math.max(...prices), offerCount: prices.length, availability: 'https://schema.org/InStock', url: window.location.href }
    : { '@type': 'Offer', priceCurrency: 'INR', price: carBasePrice(car), availability: 'https://schema.org/InStock', url: window.location.href };
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: car.name,
    image: car.images || [],
    description: car.seo_desc || car.name,
    brand: { '@type': 'Brand', name: (car.name || '').split(' ')[0] },
    offers,
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Range', value: `${carMaxRange(car)} km` },
      { '@type': 'PropertyValue', name: 'Battery', value: car.battery },
      { '@type': 'PropertyValue', name: 'Charging Time', value: car.charging_time },
    ],
  };
}

function blogArticleSchema(post, settings) {
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: post.title,
    image: post.thumbnail ? [post.thumbnail] : [],
    datePublished: post.date,
    dateModified: post.date,
    description: post.seo_desc || '',
    author: { '@type': 'Organization', name: settings.website_name || 'EV Portal' },
    publisher: {
      '@type': 'Organization',
      name: settings.website_name || 'EV Portal',
    },
    mainEntityOfPage: window.location.href,
  };
}

function breadcrumbSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

// ---------- AdSense / Analytics injection from settings.json ----------
function injectSettingsScripts(settings) {
  if (settings.analytics_id) {
    const s1 = document.createElement('script');
    s1.async = true;
    s1.src = `https://www.googletagmanager.com/gtag/js?id=${settings.analytics_id}`;
    document.head.appendChild(s1);
    const s2 = document.createElement('script');
    s2.textContent = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${settings.analytics_id}');`;
    document.head.appendChild(s2);
  }
  if (settings.search_console_meta) {
    setMeta('google-site-verification', settings.search_console_meta);
  }
  if (settings.ads_enabled && settings.adsense_client_id) {
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${settings.adsense_client_id}`;
    document.head.appendChild(s);
  }
}

function renderAdSlot(container, settings) {
  if (!container) return;
  if (!settings.ads_enabled || !settings.adsense_client_id) return;
  container.innerHTML = `<ins class="adsbygoogle" style="display:block" data-ad-client="${settings.adsense_client_id}" data-ad-slot="auto" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch (_) {}
}

// ---------- Header / Footer ----------
function renderHeader(settings) {
  const el = document.getElementById('site-header');
  if (!el) return;
  el.innerHTML = `
    <div class="wrap row">
      <a href="index.html" class="brand"><span class="bolt">⚡</span>${settings.website_name || 'EV Portal'}</a>
      <nav class="nav" id="mainNav">
        <a href="index.html#cars">Cars</a>
        <a href="index.html#blog">Blog</a>
        <a href="compare.html">Compare</a>
        <a href="page.html?slug=about-us">About</a>
        <a href="page.html?slug=contact-us">Contact</a>
      </nav>
      <button class="nav-mobile-toggle" id="navToggle" aria-label="Menu">☰</button>
    </div>`;
  document.getElementById('navToggle')?.addEventListener('click', () => {
    document.getElementById('mainNav').classList.toggle('open');
  });
}

function renderFooter(settings) {
  const el = document.getElementById('site-footer');
  if (!el) return;
  const year = new Date().getFullYear();
  el.innerHTML = `
    <div class="wrap">
      <div class="footer-cols">
        <div>
          <h5>${settings.website_name || 'EV Portal'}</h5>
          <p>${settings.global_seo_desc || 'India\u2019s independent guide to electric cars — specs, prices, range and reviews.'}</p>
        </div>
        <div><h5>Explore</h5>
          <a href="index.html#cars">All EVs</a>
          <a href="index.html#blog">Blog</a>
          <a href="compare.html">Compare cars</a>
        </div>
        <div><h5>Company</h5>
          <a href="page.html?slug=about-us">About us</a>
          <a href="page.html?slug=contact-us">Contact</a>
        </div>
        <div><h5>Legal</h5>
          <a href="page.html?slug=privacy-policy">Privacy policy</a>
          <a href="page.html?slug=terms-conditions">Terms & conditions</a>
        </div>
      </div>
      <div style="border-top:1px solid var(--line);padding-top:18px">© ${year} ${settings.website_name || 'EV Portal'}. All rights reserved.</div>
    </div>`;
}

// ---------- Helpers ----------
function fmtPrice(v) {
  if (v == null) return '—';
  const n = Number(v);
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

function qs(param) {
  return new URLSearchParams(window.location.search).get(param);
}

function rangePct(km) {
  const max = 600; // rough visual ceiling across current EV segment
  return Math.max(6, Math.min(100, Math.round((Number(km) / max) * 100)));
}

// ---------- Variant helpers ----------
// A car with no variants behaves like a single-variant car built from its
// own top-level fields, so every place that reads variants keeps working.
function carVariants(car) {
  if (car.variants && car.variants.length) return car.variants;
  return [{ id: 'base', name: 'Standard', price: car.price, range: car.range, battery: car.battery, charging_time: car.charging_time }];
}
function carBasePrice(car) {
  const prices = carVariants(car).map(v => Number(v.price)).filter(n => !isNaN(n));
  return prices.length ? Math.min(...prices) : car.price;
}
function carMaxRange(car) {
  const ranges = carVariants(car).map(v => Number(v.range)).filter(n => !isNaN(n));
  return ranges.length ? Math.max(...ranges) : car.range;
}

function carCardHTML(car) {
  const img = (car.images && car.images[0]) || 'https://placehold.co/480x360?text=EV';
  const basePrice = carBasePrice(car);
  const maxRange = carMaxRange(car);
  return `
  <a class="card" href="car.html?slug=${encodeURIComponent(car.slug)}">
    <div class="card-media"><img src="${img}" alt="${car.name}" loading="lazy"></div>
    <div class="card-body">
      <div class="card-cat">${car.category || 'EV'}</div>
      <h3>${car.name}</h3>
      <div class="price">${fmtPrice(basePrice)} <small>onwards</small></div>
      <div class="readout">
        <div class="bar"><span style="width:${rangePct(maxRange)}%"></span></div>
        <div class="val">${maxRange || '—'} km</div>
      </div>
    </div>
  </a>`;
}

function postCardHTML(post) {
  const img = post.thumbnail || 'https://placehold.co/360x240?text=Blog';
  const date = post.date ? new Date(post.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  return `
  <a class="post-card" href="blog.html?slug=${encodeURIComponent(post.slug)}">
    <img src="${img}" alt="${post.title}" loading="lazy">
    <div>
      <div class="meta">${post.category || 'News'} · ${date}</div>
      <h3>${post.title}</h3>
      <p>${(post.seo_desc || '').slice(0, 130)}</p>
    </div>
  </a>`;
}
