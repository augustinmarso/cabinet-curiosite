// Échelle, boîtes sur mesure et agencement du meuble. Toutes les cotes sont en cm.

export const IMPRESSION_MIN = 1.5;   // en dessous, un objet est agrandi (et signalé)
export const IMPRESSION_MAX = { 0.2: 30, 0.5: 45 }; // au-dessus, il est réduit (et signalé)

/**
 * Hauteur imprimée d'un objet, et l'écart éventuel à l'échelle commune.
 * Les limites s'appliquent à la plus grande dimension (un objet plat et large compte par sa largeur).
 * tailleNorm : proportions de l'objet, hauteur = 1.
 */
export function hauteurImprimee(hauteurReelle, echelle, tailleNorm = { x: 1, y: 1, z: 1 }) {
  const allonge = Math.max(tailleNorm.x, tailleNorm.y, tailleNorm.z) / tailleNorm.y;
  const brute = hauteurReelle * echelle, plusGrande = brute * allonge;
  const max = IMPRESSION_MAX[echelle] ?? 40;
  if (plusGrande < IMPRESSION_MIN) return { h: IMPRESSION_MIN / allonge, horsEchelle: `agrandi ×${fmt(IMPRESSION_MIN / plusGrande)}` };
  if (plusGrande > max) return { h: max / allonge, horsEchelle: `réduit à 1/${Math.round(hauteurReelle * allonge / max)}` };
  return { h: brute, horsEchelle: null };
}

const arrondi = (v, pas = .5) => Math.ceil(v / pas) * pas;
export const fmt = (v, d = 1) => Number(v.toFixed(d)).toLocaleString('fr-FR');

/**
 * Boîte adaptée à un objet imprimé (x = largeur, y = hauteur, z = profondeur).
 * Les dimensions intérieures laissent un jeu autour de l'objet, arrondies au demi-centimètre.
 */
export function boite(tailleObjet, jeu, epaisseur) {
  const int = {
    x: arrondi(tailleObjet.x + 2 * jeu),
    y: arrondi(tailleObjet.y + jeu * 1.25),
    z: arrondi(tailleObjet.z + 2 * jeu),
  };
  // Minimum raisonnable pour pouvoir assembler les entures
  for (const k of ['x', 'y', 'z']) int[k] = Math.max(int[k], 3);
  const ext = { x: int.x + 2 * epaisseur, y: int.y + 2 * epaisseur, z: int.z + epaisseur }; // face avant ouverte
  return { int, ext };
}

/**
 * Choisit la largeur du meuble selon le nombre et la taille des boîtes :
 * on essaie toutes les largeurs possibles (au centimètre) et on garde celle qui donne
 * les proportions d'un cabinet (un peu plus haut que large) en perdant le moins de place.
 */
export function agencer(boites, largeurMax, ratioCible = 1.15) {
  if (!boites.length) return { positions: [], largeur: 0, hauteur: 0, profondeur: 0 };
  const plusLarge = Math.max(...boites.map(b => b.ext.x));
  const somme = boites.reduce((s, b) => s + b.ext.x, 0);
  const aire = boites.reduce((s, b) => s + b.ext.x * b.ext.y, 0);
  const fin = Math.max(plusLarge, Math.min(largeurMax, somme));
  let meilleur = null;
  for (let L = plusLarge; L <= fin + 1e-6; L += Math.max(.5, (fin - plusLarge) / 200)) {
    const r = etageres(boites, L);
    const score = Math.abs(Math.log((r.hauteur / r.largeur) / ratioCible)) + (1 - aire / (r.largeur * r.hauteur)) * 1.5;
    if (!meilleur || score < meilleur.score - 1e-9) meilleur = { ...r, score };
  }
  return meilleur;
}

/**
 * Rangement par étagères : du plus haut au plus bas, de gauche à droite,
 * nouvelle rangée quand la largeur est atteinte. Rangée la plus haute en bas.
 */
function etageres(boites, largeurMax) {
  const ordre = boites.map((b, i) => ({ ...b, i })).sort((a, b) => b.ext.y - a.ext.y || b.ext.x - a.ext.x);
  const rangees = [];
  for (const b of ordre) {
    let r = rangees.find(r => r.largeur + b.ext.x <= largeurMax);
    if (!r) { r = { largeur: 0, hauteur: 0, items: [] }; rangees.push(r); }
    r.items.push(b); r.largeur += b.ext.x; r.hauteur = Math.max(r.hauteur, b.ext.y);
  }
  const positions = new Array(boites.length);
  let y = 0, largeur = 0, profondeur = 0;
  for (const r of rangees) {
    // On centre chaque rangée
    let x = -r.largeur / 2;
    for (const b of r.items) {
      positions[b.i] = { x: x + b.ext.x / 2, y, z: -b.ext.z / 2 }; // posée au fond du meuble
      x += b.ext.x;
      profondeur = Math.max(profondeur, b.ext.z);
    }
    y += r.hauteur; largeur = Math.max(largeur, r.largeur);
  }
  return { positions, largeur, hauteur: y, profondeur };
}

/** Estimation indicative du prix (à affiner avec le fabricant). */
export function estimerPrix(objets, boites, meuble, tarifs = TARIFS) {
  const volume = objets.reduce((s, o) => s + o.volume, 0); // cm³
  const surface = boites.reduce((s, b) => s + surfaceBoite(b.ext), 0) + surfaceBoite(meuble); // cm²
  const impression = objets.length * tarifs.parObjet + volume * tarifs.cm3;
  const decoupe = surface / 1e4 * tarifs.m2Bois + boites.length * tarifs.parBoite;
  const montage = tarifs.montage;
  return { volume, surface, impression, decoupe, montage, total: impression + decoupe + montage };
}
const surfaceBoite = (e) => e.x * e.y + 2 * e.x * e.z + 2 * e.y * e.z;
export const TARIFS = { parObjet: 4, cm3: .35, m2Bois: 28, parBoite: 3, montage: 25 };
