// Cabinet de curiosités — serveur zéro dépendance.
// Sert public/ et modeles/, et expose l'API : taille (Gemini), 3D (fal.ai), collections, devis.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const MODELES = path.join(ROOT, 'modeles');
const DEVIS = path.join(ROOT, 'devis');
const PORT = Number(process.env.PORT) || 5280;

// .env minimal (clé=valeur), sans dépendance
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* pas de .env : mode local */ }

const ia = require('./lib/ia');
const collections = require('./lib/collections');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.glb': 'model/gltf-binary', '.stl': 'model/stl', '.ico': 'image/x-icon',
};

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readJson(req, limit = 12e6) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('trop volumineux'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// Petit cache mémoire pour le proxy (images de musée, modèles Smithsonian)
const cache = new Map();

const api = {
  'GET /api/config': async () => ia.config(),

  // Taille réelle estimée par Gemini (null si pas de clé → le client se replie)
  'POST /api/estimate': async (req) => {
    const r = await ia.estimerTaille(await readJson(req));
    return r ? { provider: 'gemini', ...r } : { provider: null };
  },

  // Image → 3D via fal.ai : lancement, puis suivi
  'POST /api/generate': async (req) => (await ia.lancerGeneration(await readJson(req), MODELES)) || { provider: null },
  'GET /api/generate': async (req, url) => ia.suivreGeneration(url.searchParams.get('id')),

  'GET /api/collections': async (req, url) => {
    const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
    if (!q) return { q, resultats: [] };
    const anglais = await ia.traduireRecherche(q);
    return { ...(await collections.chercher(anglais)), traduit: anglais !== q ? anglais : null };
  },

  'POST /api/devis': async (req) => {
    const body = await readJson(req);
    if (!body.email || !/.+@.+\..+/.test(body.email)) throw Object.assign(new Error('e-mail invalide'), { status: 400 });
    const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).slice(2, 6);
    fs.mkdirSync(DEVIS, { recursive: true });
    fs.writeFileSync(path.join(DEVIS, id + '.json'), JSON.stringify({ id, recu: new Date().toISOString(), ...body }, null, 2));
    return { ok: true, id };
  },
};

async function proxy(res, cible) {
  if (!collections.autorise(cible)) return send(res, 403, { error: 'hôte non autorisé' });
  let e = cache.get(cible);
  if (!e) {
    const r = await fetch(cible, { signal: AbortSignal.timeout(60000), headers: { 'User-Agent': 'cabinet-curiosite/0.2' } });
    if (!r.ok) return send(res, 502, { error: 'source ' + r.status });
    e = { type: r.headers.get('content-type') || 'application/octet-stream', corps: Buffer.from(await r.arrayBuffer()) };
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    cache.set(cible, e);
  }
  res.writeHead(200, { 'Content-Type': e.type, 'Cache-Control': 'public, max-age=86400' });
  res.end(e.corps);
}

function statique(res, base, chemin) {
  const file = path.normalize(path.join(base, chemin));
  if (!file.startsWith(base)) return send(res, 403, 'interdit', 'text/plain');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'introuvable', 'text/plain');
    send(res, 200, data, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    const handler = api[`${req.method} ${url.pathname}`];
    if (handler) return send(res, 200, await handler(req, url));
    if (req.method !== 'GET') return send(res, 405, { error: 'méthode' });
    if (url.pathname === '/api/proxy') return await proxy(res, url.searchParams.get('url') || '');
    const chemin = decodeURIComponent(url.pathname);
    if (chemin.startsWith('/modeles/')) return statique(res, MODELES, chemin.slice('/modeles'.length));
    statique(res, PUBLIC, chemin.endsWith('/') ? chemin + 'index.html' : chemin);
  } catch (e) {
    console.error(e.message);
    send(res, e.status || 500, { error: e.message });
  }
}).listen(PORT, () => {
  const c = ia.config();
  console.log(`Cabinet de curiosités → http://localhost:${PORT}`);
  console.log(`  taille : ${c.estimate || 'repli local (ajoutez GEMINI_API_KEY dans .env)'}`);
  console.log(`  3D     : ${c.generate || 'relief local (ajoutez FAL_KEY dans .env)'}`);
});
