// Recherche dans des collections ouvertes, sans clé — module partagé serveur / navigateur.
// Met, Art Institute of Chicago et Cleveland (images CC0 + dimensions réelles),
// Smithsonian 3D (modèles GLB CC0, prêts à imprimer, sans coût de génération).
// `px` réécrit l'URL d'une image (proxy), `obtenir` fait une requête JSON.

// Œuvres plates : sans intérêt pour un cabinet d'objets en volume
const PLAT = /paint|print|drawing|watercolor|photograph|textile|manuscript|book|album|poster|miniature/i;

// « H. 8 1/2 in. (21.6 cm) », « Overall: 11 × 6 5/8 in. (27.9 × 16.8 × 10.8 cm) » → 21.6 / 27.9
export function hauteurMet(dim) {
  if (!dim) return null;
  const par = dim.match(/\(([^)]*cm)\)/);
  const n = (par ? par[1] : dim).match(/(\d+(?:\.\d+)?)\s*(?:×|x|cm)/);
  const v = n ? parseFloat(n[1]) : null;
  return v > 0 ? v : null;
}

async function met(q, n, { px, obtenir }) {
  const s = await obtenir(`https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isPublicDomain=true&q=${encodeURIComponent(q)}`);
  const ids = (s.objectIDs || []).slice(0, n * 2);
  const objets = await Promise.all(ids.map(id => obtenir(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`).catch(() => null)));
  return objets.filter(o => o?.isPublicDomain && o.primaryImageSmall && !PLAT.test(o.classification || '')).slice(0, n).map(o => ({
    source: 'The Met', id: 'met-' + o.objectID, titre: o.title, date: o.objectDate || '',
    image: px(o.primaryImageSmall), hauteur_cm: hauteurMet(o.dimensions), lien: o.objectURL, licence: 'CC0',
  }));
}

async function aic(q, n, { px, obtenir }) {
  const s = await obtenir(`https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(q)}&query%5Bterm%5D%5Bis_public_domain%5D=true&fields=id,title,image_id,dimensions_detail,date_display,artwork_type_title&limit=${n * 3}`);
  return (s.data || []).filter(o => o.image_id && !PLAT.test(o.artwork_type_title || '')).slice(0, n).map(o => ({
    source: 'Art Institute of Chicago', id: 'aic-' + o.id, titre: o.title, date: o.date_display || '',
    image: px(`https://www.artic.edu/iiif/2/${o.image_id}/full/600,/0/default.jpg`),
    hauteur_cm: o.dimensions_detail?.[0]?.height || null, lien: `https://www.artic.edu/artworks/${o.id}`, licence: 'CC0',
  }));
}

async function cleveland(q, n, { px, obtenir }) {
  const s = await obtenir(`https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(q)}&has_image=1&cc0=1&limit=${n * 3}`);
  return (s.data || []).filter(o => o.images?.web?.url && !PLAT.test(o.type || '')).slice(0, n).map(o => {
    const d = o.dimensions && Object.values(o.dimensions)[0];
    return {
      source: 'Cleveland Museum of Art', id: 'cma-' + o.id, titre: o.title, date: o.creation_date || '',
      image: px(o.images.web.url), hauteur_cm: d?.height ? Math.round(d.height * 1000) / 10 : null, // mètres → cm
      lien: o.url, licence: 'CC0',
    };
  });
}

async function smithsonian3d(q, n, { px3d, obtenir }) {
  const s = await obtenir(`https://3d-api.si.edu/api/v1.0/content/file/search?q=${encodeURIComponent(q)}&file_type=glb&rows=80`);
  // Plusieurs qualités par modèle : on garde la « Low » (~150k faces), assez fine pour imprimer une miniature
  const parModele = new Map();
  for (const r of s.rows || []) {
    const c = r.content; if (!c?.uri) continue;
    const rang = { Low: 3, Medium: 2, High: 1, Thumb: 0 }[c.quality] ?? 0;
    const prec = parModele.get(c.model_url);
    if (!prec || rang > prec.rang) parModele.set(c.model_url, { rang, titre: r.title, uri: c.uri });
  }
  return [...parModele.entries()].slice(0, n).map(([id, m]) => ({
    source: 'Smithsonian 3D', id: 'si-' + id.split(':').pop(), titre: m.titre, date: '',
    image: null, glb: px3d(m.uri), hauteur_cm: null, lien: 'https://3d.si.edu/', licence: 'CC0 (voir la fiche)',
  }));
}

export async function chercher(q, outils, n = 6) {
  const o = { px3d: (u) => u, ...outils };
  const res = await Promise.allSettled([met, aic, cleveland, smithsonian3d].map(f => f(q, n, o)));
  return {
    q,
    resultats: res.flatMap(r => r.status === 'fulfilled' ? r.value : []),
    erreurs: res.filter(r => r.status === 'rejected').map(r => String(r.reason?.message || r.reason)),
  };
}
