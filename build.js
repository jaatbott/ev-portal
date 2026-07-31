/* ============================================================
   build.js — Static Site Generator for the EV Portal
   Runs in GitHub Actions (see .github/workflows/build.yml) any time
   data/*.json changes. Produces fully baked HTML — real content in
   the initial response, no client-side fetch needed for indexing.
   No server involved: this is a one-shot Node script, not a service.
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const cars = safeRead('data/cars.json', []);
const blogs = safeRead('data/blogs.json', []);
const pages = safeRead('data/pages.json', []);
const settings = safeRead('data/settings.json', {});

function safeRead(p, fallback) {
  try { return read(p); } catch (e) { return fallback; }
}

const FONT_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">`;

// ---------- small helpers (mirrors js/site.js, kept dependency-free for Node) ----------
function esc(s) { return (s == null ? '' : String(s)); }
function fmtPrice(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
}
function rangePct(km) { return Math.max(6, Math.min(100, Math.round((Number(km) / 600) * 100))); }
function rootPath(depth) { return depth === 0 ? '' : '../'.repeat(depth); }

function siteUrl() {
  // Prefer settings.json (set from the admin panel — always up to date),
  // fall back to package.json "homepage" if that's the only place it's set.
  if (settings.site_url) return settings.site_url.replace(/\/$/, '');
  try {
    const pkg = read('package.json');
    if (pkg.homepage) return pkg.homepage.replace(/\/$/, '');
  } catch (e) {}
  return '';
}
const SITE_URL = siteUrl();

// ---------- shared chrome ----------
function headerHTML(root, s) {
  return `<header class="site-header">
    <div class="wrap row">
      <a href="${root}index.html" class="brand"><span class="bolt">⚡</span>${esc(s.website_name || 'EV Portal')}</a>
      <nav class="nav" id="mainNav">
        <a href="${root}index.html#cars">Cars</a>
        <a href="${root}index.html#blog">Blog</a>
        <a href="${root}compare.html">Compare</a>
        <a href="${root}pages/about-us/index.html">About</a>
        <a href="${root}pages/contact-us/index.html">Contact</a>
      </nav>
      <button class="nav-mobile-toggle" id="navToggle" aria-label="Menu">☰</button>
    </div></header>
    <script>document.getElementById('navToggle')?.addEventListener('click',()=>document.getElementById('mainNav').classList.toggle('open'));</script>`;
}

function footerHTML(root, s) {
  const year = new Date().getFullYear();
  return `<footer class="site-footer">
    <div class="wrap">
      <div class="footer-cols">
        <div><h5>${esc(s.website_name || 'EV Portal')}</h5><p>${esc(s.global_seo_desc || "India's independent guide to electric cars.")}</p></div>
        <div><h5>Explore</h5><a href="${root}index.html#cars">All EVs</a><a href="${root}index.html#blog">Blog</a><a href="${root}compare.html">Compare cars</a></div>
        <div><h5>Company</h5><a href="${root}pages/about-us/index.html">About us</a><a href="${root}pages/contact-us/index.html">Contact</a></div>
        <div><h5>Legal</h5><a href="${root}pages/privacy-policy/index.html">Privacy policy</a><a href="${root}pages/terms-conditions/index.html">Terms & conditions</a></div>
      </div>
      <div style="border-top:1px solid var(--line);padding-top:18px">© ${year} ${esc(s.website_name || 'EV Portal')}. All rights reserved.</div>
    </div></footer>`;
}

function settingsScripts(s) {
  let out = '';
  if (s.analytics_id) {
    out += `<script async src="https://www.googletagmanager.com/gtag/js?id=${s.analytics_id}"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${s.analytics_id}');</script>`;
  }
  if (s.ads_enabled && s.adsense_client_id) {
    out += `<script async crossorigin="anonymous" src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${s.adsense_client_id}"></script>`;
  }
  return out;
}

function metaBlock({ title, description, image, url, type = 'website', s }) {
  let out = `<title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="index, follow">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:type" content="${type}">
  ${url ? `<meta property="og:url" content="${url}"><link rel="canonical" href="${url}">` : ''}
  ${image ? `<meta property="og:image" content="${image}">` : ''}
  <meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">`;
  if (s && s.search_console_meta) out += `\n  <meta name="google-site-verification" content="${s.search_console_meta}">`;
  return out;
}

function jsonld(obj) { return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`; }

function page({ root, headExtra, bodyExtra, s }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${headExtra}
${FONT_LINK}
<link rel="stylesheet" href="${root}css/style.css">
${settingsScripts(s)}
</head>
<body>
${headerHTML(root, s)}
${bodyExtra}
${footerHTML(root, s)}
<script src="${root}js/site.js"></script>
</body>
</html>`;
}

// ---------- cards ----------
function carCardHTML(car, root) {
  const img = (car.images && car.images[0]) || 'https://placehold.co/480x360?text=EV';
  return `<a class="card" href="${root}cars/${car.slug}/index.html">
    <div class="card-media"><img src="${img}" alt="${esc(car.name)}" loading="lazy"></div>
    <div class="card-body">
      <div class="card-cat">${esc(car.category || 'EV')}</div>
      <h3>${esc(car.name)}</h3>
      <div class="price">${fmtPrice(car.price)} <small>onwards</small></div>
      <div class="readout"><div class="bar"><span style="width:${rangePct(car.range)}%"></span></div><div class="val">${esc(car.range) || '—'} km</div></div>
    </div></a>`;
}

function postCardHTML(post, root) {
  const img = post.thumbnail || 'https://placehold.co/360x240?text=Blog';
  const date = post.date ? new Date(post.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  return `<a class="post-card" href="${root}blog/${post.slug}/index.html">
    <img src="${img}" alt="${esc(post.title)}" loading="lazy">
    <div><div class="meta">${esc(post.category || 'News')} · ${date}</div><h3>${esc(post.title)}</h3><p>${esc(post.seo_desc || '').slice(0, 130)}</p></div>
  </a>`;
}

// ---------- HOMEPAGE ----------
function buildHome() {
  const carsHTML = cars.length ? cars.map(c => carCardHTML(c, '')).join('') :
    `<div class="empty-state" style="grid-column:1/-1"><h3>No cars listed yet</h3><p>Add your first EV from the admin panel.</p></div>`;
  const blogsHTML = blogs.length
    ? blogs.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).map(p => postCardHTML(p, '')).join('')
    : `<div class="empty-state"><h3>No posts yet</h3><p>Publish your first article from the admin panel.</p></div>`;

  const body = `
<section class="hero"><div class="wrap">
  <div class="eyebrow">⚡ INDIA'S EV GUIDE — UPDATED WEEKLY</div>
  <h1>Every electric car in India, compared on real numbers.</h1>
  <p class="lead">Price, range, battery and charging time — laid out plainly so you can decide without the sales pitch.</p>
  <form class="hero-search" id="heroSearchForm" onsubmit="event.preventDefault();filterCars(this.q.value)">
    <input type="text" name="q" id="carSearch" placeholder="Search cars — e.g. Nexon, Ioniq, under 15 lakh">
    <button class="btn btn-primary" type="submit">Search</button>
  </form>
</div></section>
<section class="section" id="cars"><div class="wrap">
  <div class="section-head"><h2>Electric cars</h2><a class="view-all" href="compare.html">Compare two cars →</a></div>
  <div class="grid grid-4" id="carsGrid">${carsHTML}</div>
</div></section>
<div class="wrap"><div class="ad-slot" id="adSlot1">Advertisement</div></div>
<section class="section" id="blog"><div class="wrap">
  <div class="section-head"><h2>From the blog</h2></div>
  <div id="blogList">${blogsHTML}</div>
</div></section>
<script>
function filterCars(q){
  q=(q||'').toLowerCase();
  document.querySelectorAll('#carsGrid .card').forEach(card=>{
    const text=card.textContent.toLowerCase();
    card.style.display = text.includes(q) ? '' : 'none';
  });
  document.getElementById('cars').scrollIntoView({behavior:'smooth'});
}
</script>`;

  const html = page({
    root: '',
    headExtra: metaBlock({
      title: settings.global_seo_title || 'EV Portal',
      description: settings.global_seo_desc || '',
      url: SITE_URL ? `${SITE_URL}/` : '',
      s: settings,
    }) + jsonld({ '@context': 'https://schema.org', '@type': 'WebSite', name: settings.website_name, url: SITE_URL || undefined }),
    bodyExtra: body,
    s: settings,
  });
  write('index.html', html);
}

// ---------- CAR DETAIL PAGES ----------
function buildCars() {
  cars.forEach((car) => {
    const images = car.images && car.images.length ? car.images : ['https://placehold.co/900x560?text=EV'];
    const url = SITE_URL ? `${SITE_URL}/cars/${car.slug}/` : '';
    const body = `
<div class="wrap" style="padding-top:28px">
  <nav class="mono" style="font-size:12px;color:var(--muted);margin-bottom:18px"><a href="../../index.html" style="color:var(--muted)">Home</a> / <span style="color:var(--ink)">${esc(car.name)}</span></nav>
  <div class="detail-grid">
    <div>
      <div class="gallery-main"><img id="mainImg" src="${images[0]}" alt="${esc(car.name)}"></div>
      <div class="gallery-thumbs">${images.map((img, i) => `<img src="${img}" class="${i === 0 ? 'active' : ''}" onclick="document.getElementById('mainImg').src='${img}';document.querySelectorAll('.gallery-thumbs img').forEach(el=>el.classList.remove('active'));this.classList.add('active')">`).join('')}</div>
      <h1 style="margin-top:28px">${esc(car.name)}</h1>
      <span class="badge">${esc(car.category || 'EV')}</span>
      <div class="prose" style="margin-top:20px"><h2>Overview</h2><p>${esc(car.seo_desc || '')}</p></div>
      <div id="giscusThread" style="margin-top:36px"></div>
    </div>
    <aside class="spec-panel">
      <div class="spec-price">${fmtPrice(car.price)} <small>ex-showroom, onwards</small></div>
      <div class="spec-row"><span class="k">Range</span><span class="v">${esc(car.range) || '—'} km</span></div>
      <div class="spec-row"><span class="k">Battery</span><span class="v">${esc(car.battery) || '—'}</span></div>
      <div class="spec-row"><span class="k">Charging time</span><span class="v">${esc(car.charging_time) || '—'}</span></div>
      <a class="btn btn-primary btn-block" style="margin-top:18px" href="../../compare.html?a=${car.slug}">Compare this car</a>
      <div class="emi-box">
        <h4>EMI Calculator</h4>
        <div class="emi-row"><span>Down payment</span><span id="dpVal" class="mono"></span></div>
        <input type="range" id="dpRange" min="0" max="90" value="20">
        <div class="emi-row" style="margin-top:14px"><span>Loan tenure</span><span id="tenureVal" class="mono"></span></div>
        <input type="range" id="tenureRange" min="1" max="7" value="5">
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid rgba(43,95,255,.15)">
          <div class="emi-row"><span>Estimated EMI</span></div>
          <div class="out" id="emiOut">₹0 / mo</div>
          <p style="font-size:11.5px;color:var(--ink-soft);margin-top:6px">At 9% p.a. Indicative only — confirm with your lender.</p>
        </div>
      </div>
    </aside>
  </div>
</div>
<script>
(function(){
  const price=${Number(car.price) || 0}, rate=0.09;
  const dp=document.getElementById('dpRange'), tn=document.getElementById('tenureRange');
  function calc(){
    const dpPct=Number(dp.value), years=Number(tn.value);
    document.getElementById('dpVal').textContent=dpPct+'%';
    document.getElementById('tenureVal').textContent=years+(years===1?' year':' years');
    const principal=price*(1-dpPct/100), r=rate/12, n=years*12;
    const emi=principal*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1);
    document.getElementById('emiOut').textContent='₹'+Math.round(emi).toLocaleString('en-IN')+' / mo';
  }
  dp.addEventListener('input',calc); tn.addEventListener('input',calc); calc();
})();
${giscusScript(settings)}
</script>`;

    const html = page({
      root: '../../',
      headExtra: metaBlock({
        title: car.seo_title || `${car.name} — Price, Range & Specs`,
        description: car.seo_desc || '',
        image: images[0],
        url,
        type: 'product',
        s: settings,
      }) + jsonld(carProductSchema(car, url)) + jsonld(breadcrumbSchema([
        { name: 'Home', url: SITE_URL ? `${SITE_URL}/` : '' },
        { name: car.name, url },
      ])),
      bodyExtra: body,
      s: settings,
    });
    write(`cars/${car.slug}/index.html`, html);
  });
}

function carProductSchema(car, url) {
  return {
    '@context': 'https://schema.org', '@type': 'Product', name: car.name,
    image: car.images || [], description: car.seo_desc || car.name,
    brand: { '@type': 'Brand', name: (car.name || '').split(' ')[0] },
    offers: { '@type': 'Offer', priceCurrency: 'INR', price: car.price, availability: 'https://schema.org/InStock', url },
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Range', value: `${car.range} km` },
      { '@type': 'PropertyValue', name: 'Battery', value: car.battery },
      { '@type': 'PropertyValue', name: 'Charging Time', value: car.charging_time },
    ],
  };
}
function breadcrumbSchema(items) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })) };
}
function giscusScript(s) {
  if (!s.giscus_repo || !s.giscus_repo_id) return '';
  return `(function(){var s=document.createElement('script');s.src='https://giscus.app/client.js';s.setAttribute('data-repo','${s.giscus_repo}');s.setAttribute('data-repo-id','${s.giscus_repo_id}');s.setAttribute('data-category','${s.giscus_category || 'General'}');s.setAttribute('data-category-id','${s.giscus_category_id || ''}');s.setAttribute('data-mapping','pathname');s.setAttribute('data-theme','light');s.crossOrigin='anonymous';s.async=true;document.getElementById('giscusThread').appendChild(s);})();`;
}

// ---------- BLOG DETAIL PAGES ----------
function buildBlogs() {
  blogs.forEach((post) => {
    const url = SITE_URL ? `${SITE_URL}/blog/${post.slug}/` : '';
    const date = post.date ? new Date(post.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const body = `
<div class="wrap" style="padding-top:28px;max-width:760px">
  <nav class="mono" style="font-size:12px;color:var(--muted);margin-bottom:18px"><a href="../../index.html" style="color:var(--muted)">Home</a> / <a href="../../index.html#blog" style="color:var(--muted)">Blog</a></nav>
  <div class="mono" style="font-size:12px;color:var(--volt);text-transform:uppercase;letter-spacing:.06em">${esc(post.category || 'News')} · ${date}</div>
  <h1 style="margin-top:10px">${esc(post.title)}</h1>
  ${post.thumbnail ? `<img src="${post.thumbnail}" alt="${esc(post.title)}" style="width:100%;border-radius:16px;margin:20px 0">` : ''}
  <div class="prose">${post.content || ''}</div>
  <div class="ad-slot" id="adSlotBlog">Advertisement</div>
  <div id="giscusThread" style="margin-top:30px"></div>
</div>
<script>${giscusScript(settings)}</script>`;

    const html = page({
      root: '../../',
      headExtra: metaBlock({ title: post.seo_title || post.title, description: post.seo_desc || '', image: post.thumbnail, url, type: 'article', s: settings })
        + jsonld({ '@context': 'https://schema.org', '@type': 'NewsArticle', headline: post.title, image: post.thumbnail ? [post.thumbnail] : [], datePublished: post.date, dateModified: post.date, description: post.seo_desc || '', author: { '@type': 'Organization', name: settings.website_name || 'EV Portal' }, publisher: { '@type': 'Organization', name: settings.website_name || 'EV Portal' }, mainEntityOfPage: url }),
      bodyExtra: body,
      s: settings,
    });
    write(`blog/${post.slug}/index.html`, html);
  });
}

// ---------- STATIC PAGES ----------
function buildPages() {
  pages.forEach((p) => {
    const url = SITE_URL ? `${SITE_URL}/pages/${p.slug}/` : '';
    let extra = '';
    if (p.slug === 'contact-us') {
      extra = `<form id="leadForm" style="margin-top:24px">
        <div class="form-field" style="margin-bottom:16px"><label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px">Your name</label><input type="text" name="name" required style="width:100%;padding:12px 14px;border:1px solid var(--line-strong);border-radius:10px"></div>
        <div class="form-field" style="margin-bottom:16px"><label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px">Email</label><input type="email" name="email" required style="width:100%;padding:12px 14px;border:1px solid var(--line-strong);border-radius:10px"></div>
        <div class="form-field" style="margin-bottom:16px"><label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px">Message</label><textarea name="message" required style="width:100%;min-height:120px;padding:12px 14px;border:1px solid var(--line-strong);border-radius:10px"></textarea></div>
        <input type="hidden" name="access_key" value="${settings.web3forms_access_key || ''}">
        <button class="btn btn-primary" type="submit">Send message</button>
        <p id="formStatus" class="mono" style="font-size:12.5px;margin-top:10px"></p>
      </form>
      <script>
      ${settings.web3forms_access_key ? '' : `document.currentScript.insertAdjacentHTML('beforebegin','');document.getElementById('formStatus').textContent='Contact form is not configured yet.';`}
      document.getElementById('leadForm').addEventListener('submit', async function(e){
        e.preventDefault();
        var status=document.getElementById('formStatus');
        ${settings.web3forms_access_key ? '' : 'return;'}
        status.textContent='Sending…';
        try{
          const res=await fetch('https://api.web3forms.com/submit',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(this)))});
          const json=await res.json();
          if(json.success){status.textContent='Message sent — we will get back to you soon.';status.style.color='var(--range-green)';this.reset();}
          else{throw new Error(json.message||'Failed to send');}
        }catch(err){status.textContent='Could not send message: '+err.message;status.style.color='var(--danger)';}
      });
      </script>`;
    }
    const body = `<div class="wrap" style="padding-top:28px;max-width:720px"><h1>${esc(p.title)}</h1><div class="prose">${p.content || ''}</div>${extra}</div>`;
    const html = page({
      root: '../../',
      headExtra: metaBlock({ title: p.seo_title || p.title, description: p.seo_desc || '', url, s: settings }),
      bodyExtra: body,
      s: settings,
    });
    write(`pages/${p.slug}/index.html`, html);
  });
}

// ---------- SITEMAP ----------
function buildSitemap() {
  if (!SITE_URL) { console.log('No "homepage" set in package.json — skipping sitemap.xml (add one for a full absolute-URL sitemap).'); return; }
  const urls = [
    `${SITE_URL}/`,
    `${SITE_URL}/compare.html`,
    ...cars.map(c => `${SITE_URL}/cars/${c.slug}/`),
    ...blogs.map(b => `${SITE_URL}/blog/${b.slug}/`),
    ...pages.map(p => `${SITE_URL}/pages/${p.slug}/`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>`;
  write('sitemap.xml', xml);
}

function write(relPath, content) {
  const full = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  console.log('wrote', relPath);
}

buildHome();
buildCars();
buildBlogs();
buildPages();
buildSitemap();
console.log(`Build complete: ${cars.length} cars, ${blogs.length} posts, ${pages.length} pages.`);
