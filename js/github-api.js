/* ============================================================
   GitHubAPI — thin wrapper around the GitHub REST "contents" API.
   Used only by admin.html. Everything is client-side; the PAT never
   leaves the browser except in requests straight to api.github.com.
   ============================================================ */
class GitHubAPI {
  constructor({ owner, repo, branch = 'main', token }) {
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.token = token;
    this.base = `https://api.github.com/repos/${owner}/${repo}`;
  }

  headers() {
    return {
      Authorization: `token ${this.token}`,
      Accept: 'application/vnd.github+json',
    };
  }

  // Verify the PAT actually works and can see the repo.
  async testConnection() {
    const res = await fetch(this.base, { headers: this.headers() });
    if (!res.ok) throw new Error(`Repo access failed (${res.status}). Check owner/repo/token.`);
    return res.json();
  }

  // Get raw file content + sha (sha is required to update/delete).
  async getFile(path) {
    const res = await fetch(`${this.base}/contents/${path}?ref=${this.branch}`, {
      headers: this.headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to read ${path} (${res.status})`);
    const data = await res.json();
    const content = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
    return { content, sha: data.sha };
  }

  async getJSON(path) {
    const file = await this.getFile(path);
    if (!file) return { data: null, sha: null };
    try {
      return { data: JSON.parse(file.content), sha: file.sha };
    } catch (e) {
      throw new Error(`${path} is not valid JSON: ${e.message}`);
    }
  }

  // Create or update a text file (JSON, robots.txt, ads.txt, sitemap.xml...).
  async putText(path, text, message, sha = null) {
    const body = {
      message,
      content: btoa(unescape(encodeURIComponent(text))),
      branch: this.branch,
    };
    if (sha) body.sha = sha;
    const res = await fetch(`${this.base}/contents/${path}`, {
      method: 'PUT',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Failed to write ${path} (${res.status})`);
    }
    return res.json();
  }

  async putJSON(path, obj, message, sha = null) {
    return this.putText(path, JSON.stringify(obj, null, 2), message, sha);
  }

  // Upload a base64 image (dataURL already stripped of the "data:*;base64," prefix).
  async putImage(path, base64Data, message) {
    let existingSha = null;
    try {
      const existing = await this.getFile(path);
      if (existing) existingSha = existing.sha;
    } catch (_) {}
    const body = { message, content: base64Data, branch: this.branch };
    if (existingSha) body.sha = existingSha;
    const res = await fetch(`${this.base}/contents/${path}`, {
      method: 'PUT',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Failed to upload image (${res.status})`);
    }
    const json = await res.json();
    return json.content.download_url;
  }

  async deleteFile(path, message, sha) {
    const res = await fetch(`${this.base}/contents/${path}`, {
      method: 'DELETE',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sha, branch: this.branch }),
    });
    if (!res.ok) throw new Error(`Failed to delete ${path} (${res.status})`);
    return res.json();
  }
}

// ---- localStorage session helpers ----
const GH_SESSION_KEY = 'ev_portal_gh_session';

function saveSession({ owner, repo, branch, token }) {
  localStorage.setItem(GH_SESSION_KEY, JSON.stringify({ owner, repo, branch, token }));
}
function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(GH_SESSION_KEY));
  } catch (_) {
    return null;
  }
}
function clearSession() {
  localStorage.removeItem(GH_SESSION_KEY);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function slugify(str) {
  return (str || '')
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}
