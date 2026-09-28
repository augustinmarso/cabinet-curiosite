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
 * Agencement en bento : les casiers remplissent exactement un rectangle, sans vide.
 * On essaie toutes les largeurs possibles et on garde celle qui donne les proportions
 * d'un cabinet (un peu plus haut que large) en agrandissant le moins possible les casiers.
 * Retourne les positions et les boîtes agrandies (mêmes indices que l'entrée).
 */
export function agencer(boites, largeurMax, epaisseur = .3, ratioCible = 1.15) {
  if (!boites.length) return { positions: [], boites: [], largeur: 0, hauteur: 0, profondeur: 0 };
  const plusLarge = Math.max(...boites.map(b => b.ext.x));
  const somme = boites.reduce((s, b) => s + b.ext.x, 0);
  const aire = boites.reduce((s, b) => s + b.ext.x * b.ext.y, 0);
  const fin = Math.max(plusLarge, Math.min(largeurMax, somme));
  let meilleur = null;
  for (let L = plusLarge; L <= fin + 1e-6; L += Math.max(.5, (fin - plusLarge) / 200)) {
    const r = bento(boites, L, epaisseur);
    // Proportions + air ajouté pour combler (moins il y en a, mieux c'est)
    const score = Math.abs(Math.log((r.hauteur / r.largeur) / ratioCible)) + (1 - aire / (r.largeur * r.hauteur)) * 1.5;
    if (!meilleur || score < meilleur.score - 1e-9) meilleur = { ...r, score };
  }
  return meilleur;
}

/**
 * 1. Du plus haut au plus bas : chaque boîte s'empile dans une colonne existante s'il reste
 *    de la hauteur dans la rangée et si les largeurs se ressemblent, sinon ouvre une colonne,
 *    sinon ouvre une rangée.
 * 2. On étire : les colonnes se partagent la largeur restante de leur rangée, les boîtes d'une
 *    colonne se partagent la hauteur restante. Profondeur commune à tout le meuble.
 */
function bento(boites, L, e) {
  const items = boites.map((b, i) => ({ i, w: b.ext.x, h: b.ext.y, d: b.ext.z })).sort((a, b) => b.h - a.h || b.w - a.w);
  const rangees = [];
  for (const it of items) {
    let place = false;
    for (const r of rangees) {
      for (const c of r.cols) {
        const larg = Math.max(c.w, it.w);
        if (c.hUtil + it.h <= r.h + 1e-9 && larg <= Math.min(c.w, it.w) * 1.6 && r.w - c.w + larg <= L + 1e-9) {
          r.w += larg - c.w; c.w = larg; c.hUtil += it.h; c.items.push(it); place = true; break;
        }
      }
      if (place) break;
      if (r.w + it.w <= L + 1e-9) { r.cols.push({ w: it.w, hUtil: it.h, items: [it] }); r.w += it.w; place = true; break; }
    }
    if (!place) rangees.push({ h: it.h, w: it.w, cols: [{ w: it.w, hUtil: it.h, items: [it] }] });
  }

  const largeur = Math.max(...rangees.map(r => r.w));
  const profondeur = Math.max(...items.map(it => it.d));
  const positions = new Array(boites.length), agrandies = new Array(boites.length);
  let y = 0;
  for (const r of rangees) {
    const kx = largeur / r.w; // chaque colonne s'élargit d'autant
    let x = -largeur / 2;
    for (const c of r.cols) {
      const w = c.w * kx, ky = r.h / c.hUtil;
      let yc = y;
      for (const it of c.items) {
        const h = it.h * ky;
        const ext = { x: w, y: h, z: profondeur };
        agrandies[it.i] = { ext, int: { x: w - 2 * e, y: h - 2 * e, z: profondeur - e } };
        positions[it.i] = { x: x + w / 2, y: yc, z: -profondeur / 2 };
        yc += h;
      }
      x += w;
    }
    y += r.h;
  }
  return { positions, boites: agrandies, largeur, hauteur: y, profondeur };
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
