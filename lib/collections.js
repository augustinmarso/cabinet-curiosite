// Côté serveur : les sources (public/js/sources.js, partagé avec le navigateur)
// passent par le proxy local, qui ajoute le CORS et met en cache.
const path = require('path');
const { pathToFileURL } = require('url');

const sources = import(pathToFileURL(path.join(__dirname, '..', 'public', 'js', 'sources.js')).href);

const px = (url) => `/api/proxy?url=${encodeURIComponent(url)}`;
const obtenir = (url) => fetch(url, { signal: AbortSignal.timeout(9000), headers: { 'User-Agent': 'cabinet-curiosite/0.3' } })
  .then(r => { if (!r.ok) throw new Error(url + ' → ' + r.status); return r.json(); });

async function chercher(q, n = 6) {
  return (await sources).chercher(q, { px, px3d: px, obtenir }, n);
}

// Hôtes autorisés pour le proxy d'images et de modèles
const HOTES = [/^images\.metmuseum\.org$/, /^www\.artic\.edu$/, /^openaccess-cdn\.clevelandart\.org$/, /^(cdn\.)?3d-api\.si\.edu$/, /(^|\.)fal\.media$/];
const autorise = (url) => { try { const u = new URL(url); return u.protocol === 'https:' && HOTES.some(h => h.test(u.hostname)); } catch { return false; } };

module.exports = { chercher, autorise };
