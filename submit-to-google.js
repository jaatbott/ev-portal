/* ============================================================
   submit-to-google.js — notifies Google's Indexing API about every
   page URL after a build, so new/changed pages get crawled sooner.

   HONEST NOTE: Google's Indexing API is officially documented for
   JobPosting / BroadcastEvent pages only. In practice it also nudges
   Google to (re)crawl other page types faster, but there is no
   guarantee of "instant" indexing for a general content site — this
   is a best-effort speed boost, not a bypass of normal ranking.

   This only runs inside GitHub Actions (see .github/workflows/build.yml),
   using a service-account key stored as a repository secret. The key
   never touches the browser or the public site — that's the whole
   reason this lives in CI rather than in admin.html.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const KEY_JSON = process.env.GOOGLE_INDEXING_KEY;
if (!KEY_JSON) {
  console.log('GOOGLE_INDEXING_KEY secret not set — skipping Google Indexing API step.');
  process.exit(0);
}

let creds;
try {
  creds = JSON.parse(KEY_JSON);
} catch (e) {
  console.error('GOOGLE_INDEXING_KEY is not valid JSON — check the secret value.');
  process.exit(1);
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Build and sign a JWT, then exchange it for a Google OAuth access token
// (the standard service-account flow — no npm dependency needed).
async function getAccessToken() {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/indexing',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const signature = signer.sign(creds.private_key).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = `${unsigned}.${signature}`;

  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
  const res = await httpPost('oauth2.googleapis.com', '/token', body, { 'Content-Type': 'application/x-www-form-urlencoded' });
  const json = JSON.parse(res);
  if (!json.access_token) throw new Error('Failed to get access token: ' + res);
  return json.access_token;
}

function httpPost(hostname, urlPath, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path: urlPath, method: 'POST', headers: { 'Content-Length': Buffer.byteLength(body), ...extraHeaders } },
      (res) => {
        let data = '';
        res.on('data', (d) => (data += d));
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function readSitemapUrls() {
  const xml = fs.readFileSync(path.join(__dirname, 'sitemap.xml'), 'utf8');
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
}

async function main() {
  const urls = readSitemapUrls();
  if (!urls.length) {
    console.log('No URLs in sitemap.xml — nothing to submit.');
    return;
  }
  console.log(`Submitting ${urls.length} URL(s) to Google Indexing API…`);
  const token = await getAccessToken();

  for (const url of urls) {
    const body = JSON.stringify({ url, type: 'URL_UPDATED' });
    const res = await new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: 'indexing.googleapis.com',
          path: '/v3/urlNotifications:publish',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Content-Length': Buffer.byteLength(body) },
        },
        (r) => {
          let data = '';
          r.on('data', (d) => (data += d));
          r.on('end', () => resolve({ status: r.statusCode, data }));
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    if (res.status === 200) {
      console.log(`✓ submitted: ${url}`);
    } else {
      console.log(`✗ failed (${res.status}): ${url} — ${res.data}`);
    }
  }
}

main().catch((e) => {
  console.error('Google Indexing API step failed:', e.message);
  // Non-fatal — never break the deploy just because indexing pings failed.
  process.exit(0);
});
