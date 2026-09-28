// Moteurs IA : Gemini (taille réelle d'un objet) et fal.ai (image → 3D).
// Sans clé dans .env, chaque fonction renvoie null et le client se replie sur le local.
const fs = require('fs');
const path = require('path');

const GEMINI_URL = (modele) => `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent`;
const gemini = () => process.env.GEMINI_API_KEY ? { cle: process.env.GEMINI_API_KEY, modele: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite' } : null;

async function appelGemini(parties, schema) {
  const g = gemini();
  if (!g) return null;
  const r = await fetch(GEMINI_URL(g.modele), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': g.cle },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: parties }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('Gemini : ' + (j.error?.message || r.status));
  const texte = j.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  return JSON.parse(texte);
}

const SCHEMA_TAILLE = {
  type: 'OBJECT',
  properties: {
    objet: { type: 'STRING', description: 'Nom court de l\'objet, en français' },
    hauteur_cm: { type: 'NUMBER', description: 'Hauteur réelle typique de l\'objet, en cm' },
    largeur_cm: { type: 'NUMBER' },
    profondeur_cm: { type: 'NUMBER' },
    confiance: { type: 'NUMBER', description: 'Entre 0 et 1' },
    indice: { type: 'STRING', description: 'Ce qui justifie la taille (repère visible, taille typique…), une phrase en français' },
  },
  required: ['objet', 'hauteur_cm', 'confiance', 'indice'],
};

/** Estime la taille réelle de l'objet principal d'une image (data URL JPEG/PNG). */
async function estimerTaille({ image, nom }) {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(image || '');
  if (!m) return null;
  return appelGemini([
    { text: `Tu es conservateur d'un cabinet de curiosités. Identifie l'objet principal de cette image${nom ? ` (nom donné par l'utilisateur : « ${nom} »)` : ''} et estime ses dimensions réelles en centimètres. ` +
      `Si c'est une gravure, un dessin ou une photo d'un objet, donne la taille de l'objet représenté, pas du support. ` +
      `Utilise les repères visibles (main, pièce, règle) s'il y en a, sinon la taille typique de ce type d'objet.` },
    { inline_data: { mime_type: m[1], data: m[2] } },
  ], SCHEMA_TAILLE);
}

/** Traduit une recherche en mots-clés anglais (les grandes collections sont indexées en anglais). */
async function traduireRecherche(q) {
  const r = await appelGemini([{ text: `Traduis en anglais cette recherche dans une collection de musée, en 1 à 4 mots-clés, sans ponctuation : « ${q} »` }],
    { type: 'OBJECT', properties: { anglais: { type: 'STRING' } }, required: ['anglais'] }).catch(() => null);
  return r?.anglais || q;
}

// ─── fal.ai : file d'attente REST ───
const MODELES_3D = {
  apercu: { id: 'fal-ai/trellis', prix: 0.02, entree: (url) => ({ image_url: url }) },
  impression: { id: 'fal-ai/hunyuan3d/v2', prix: 0.16, entree: (url) => ({ input_image_url: url, textured_mesh: false }) },
};
const travaux = new Map();

async function lancerGeneration({ image, qualite = 'apercu' }, dossierModeles) {
  if (!process.env.FAL_KEY) return null;
  const modele = MODELES_3D[qualite];
  if (!modele) throw Object.assign(new Error('qualité inconnue'), { status: 400 });
  if (!/^data:image\//.test(image || '')) throw Object.assign(new Error('image manquante'), { status: 400 });
  const r = await fetch(`https://queue.fal.run/${modele.id}`, {
    method: 'POST',
    headers: { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(modele.entree(image)),
    signal: AbortSignal.timeout(30000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('fal.ai : ' + (j.detail?.[0]?.msg || j.detail || j.error || r.status));
  const id = j.request_id;
  travaux.set(id, { id, qualite, modele: modele.id, prix: modele.prix, status_url: j.status_url, response_url: j.response_url, dossier: dossierModeles, debut: Date.now() });
  journal({ evenement: 'lancement', id, modele: modele.id, prix_usd: modele.prix });
  return { id, qualite, prix_usd: modele.prix };
}

async function suivreGeneration(id) {
  const t = travaux.get(id);
  if (!t) throw Object.assign(new Error('travail inconnu'), { status: 404 });
  if (t.resultat) return t.resultat;
  const auth = { Authorization: `Key ${process.env.FAL_KEY}` };
  const s = await fetch(t.status_url, { headers: auth, signal: AbortSignal.timeout(15000) }).then(r => r.json());
  if (s.status !== 'COMPLETED') return { etat: s.status === 'IN_QUEUE' ? 'file' : 'calcul', position: s.queue_position ?? null };

  const rep = await fetch(t.response_url, { headers: auth, signal: AbortSignal.timeout(30000) });
  const j = await rep.json();
  const url = j.model_mesh?.url;
  if (!rep.ok || !url) {
    t.resultat = { etat: 'erreur', message: j.detail?.[0]?.msg || j.detail || 'aucun modèle renvoyé' };
    return t.resultat;
  }
  // On garde une copie locale : le lien fal expire, et on évite les soucis CORS
  const glb = Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(60000) })).arrayBuffer());
  fs.mkdirSync(t.dossier, { recursive: true });
  const fichier = `${id}.glb`;
  fs.writeFileSync(path.join(t.dossier, fichier), glb);
  journal({ evenement: 'fini', id, modele: t.modele, secondes: Math.round((Date.now() - t.debut) / 1000), octets: glb.length });
  t.resultat = { etat: 'fini', url: `/modeles/${fichier}`, qualite: t.qualite };
  return t.resultat;
}

// Journal des dépenses (une ligne JSON par événement)
function journal(e) {
  try { fs.appendFileSync(path.join(__dirname, '..', 'generations.jsonl'), JSON.stringify({ date: new Date().toISOString(), ...e }) + '\n'); } catch { }
}

module.exports = {
  config: () => ({ estimate: gemini() ? 'gemini' : null, generate: process.env.FAL_KEY ? 'fal' : null, prix: Object.fromEntries(Object.entries(MODELES_3D).map(([k, v]) => [k, v.prix])) }),
  estimerTaille, traduireRecherche, lancerGeneration, suivreGeneration,
};
