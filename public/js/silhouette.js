// Génération 3D locale (repli sans moteur IA) : détourage + « gonflage ».
// 1. le fond est estimé à partir des bords de l'image (ou de la transparence) ;
// 2. on garde la plus grande forme, trous bouchés ;
// 3. une transformée de distance donne l'épaisseur : section arrondie, maillage fermé.
import * as THREE from 'three';

const RES = 150; // côté max de la grille de calcul

export async function chargerImage(src) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  await img.decode();
  return img;
}

export function masquer(img, seuil = 42) {
  const k = RES / Math.max(img.naturalWidth, img.naturalHeight);
  const w = Math.max(8, Math.round(img.naturalWidth * k)), h = Math.max(8, Math.round(img.naturalHeight * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, w, h);
  const px = cx.getImageData(0, 0, w, h).data;

  // Transparence utile ?
  let transparents = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 128) transparents++;
  const parAlpha = transparents > w * h * .05;

  // Couleur du fond = médiane des pixels de bord
  const bord = [];
  for (let x = 0; x < w; x++) bord.push(x, x + (h - 1) * w);
  for (let y = 0; y < h; y++) bord.push(y * w, w - 1 + y * w);
  const med = (o) => { const v = bord.map(i => px[i * 4 + o]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const fond = [med(0), med(1), med(2)];

  const m = new Uint8Array(w * h);
  if (parAlpha) {
    for (let i = 0; i < w * h; i++) m[i] = px[i * 4 + 3] >= 128 ? 1 : 0;
  } else {
    // Croissance de région depuis les bords : le fond « coule » de proche en proche
    // tant que la couleur varie doucement (suit les dégradés et les ombres portées).
    const ecart = (i, j) => Math.hypot(px[i * 4] - px[j * 4], px[i * 4 + 1] - px[j * 4 + 1], px[i * 4 + 2] - px[j * 4 + 2]);
    const loinDuFond = (i) => Math.hypot(px[i * 4] - fond[0], px[i * 4 + 1] - fond[1], px[i * 4 + 2] - fond[2]) > seuil * 3;
    const fondPx = new Uint8Array(w * h), pile = [];
    for (const i of bord) if (!fondPx[i] && !loinDuFond(i)) { fondPx[i] = 1; pile.push(i); }
    while (pile.length) {
      const p = pile.pop(), x = p % w, y = (p / w) | 0;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q < 0 || fondPx[q]) continue;
        if (ecart(p, q) < seuil / 3.5) { fondPx[q] = 1; pile.push(q); }
      }
    }
    for (let i = 0; i < w * h; i++) m[i] = fondPx[i] ? 0 : 1;
  }
  // Petit nettoyage : fermeture (dilatation puis érosion) pour souder les traits fins
  const ferme = eroder(dilater(m, w, h), w, h);
  const forme = plusGrandeForme(ferme, w, h);
  boucherTrous(forme, w, h);
  souderDiagonales(forme, w, h);
  return { masque: forme, w, h, pixels: px };
}

// Deux pixels qui ne se touchent que par un coin donnent une arête non-manifold : on les relie.
function souderDiagonales(m, w, h) {
  let change = true;
  while (change) {
    change = false;
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
      const a = y * w + x, b = a + 1, c = a + w, d = c + 1;
      if ((m[a] && m[d] && !m[b] && !m[c]) || (m[b] && m[c] && !m[a] && !m[d])) {
        m[a] = m[b] = m[c] = m[d] = 1; change = true;
      }
    }
  }
}

function dilater(m, w, h) {
  const o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0;
    for (let dy = -1; dy <= 1 && !v; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < w && Y < h && m[Y * w + X]) { v = 1; break; }
    }
    o[y * w + x] = v;
  }
  return o;
}
function eroder(m, w, h) {
  const o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 1;
    for (let dy = -1; dy <= 1 && v; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= w || Y >= h || !m[Y * w + X]) { v = 0; break; }
    }
    o[y * w + x] = v;
  }
  return o;
}

function plusGrandeForme(m, w, h) {
  const etiq = new Int32Array(w * h).fill(-1);
  let meilleure = -1, taille = 0, n = 0;
  const pile = [];
  for (let i = 0; i < w * h; i++) {
    if (!m[i] || etiq[i] >= 0) continue;
    let t = 0; pile.push(i); etiq[i] = n;
    while (pile.length) {
      const p = pile.pop(); t++;
      const x = p % w, y = (p / w) | 0;
      for (const [X, Y] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const q = Y * w + X;
        if (m[q] && etiq[q] < 0) { etiq[q] = n; pile.push(q); }
      }
    }
    if (t > taille) { taille = t; meilleure = n; }
    n++;
  }
  const o = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) o[i] = etiq[i] === meilleure ? 1 : 0;
  return o;
}

function boucherTrous(m, w, h) {
  // Tout ce qui n'est pas relié au bord par du fond devient matière
  const dehors = new Uint8Array(w * h);
  const pile = [];
  const pousser = (i) => { if (!m[i] && !dehors[i]) { dehors[i] = 1; pile.push(i); } };
  for (let x = 0; x < w; x++) { pousser(x); pousser(x + (h - 1) * w); }
  for (let y = 0; y < h; y++) { pousser(y * w); pousser(w - 1 + y * w); }
  while (pile.length) {
    const p = pile.pop(), x = p % w, y = (p / w) | 0;
    if (x > 0) pousser(p - 1); if (x < w - 1) pousser(p + 1);
    if (y > 0) pousser(p - w); if (y < h - 1) pousser(p + w);
  }
  for (let i = 0; i < w * h; i++) if (!dehors[i]) m[i] = 1;
}

// Distance au bord (chanfrein 3-4), en pixels
function distance(m, w, h) {
  const INF = 1e9, d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = m[i] ? INF : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : d[y * w + x];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!d[i]) continue;
    d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; if (!d[i]) continue;
    d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
  }
  for (let i = 0; i < w * h; i++) d[i] /= 3;
  return d;
}

/**
 * Construit un maillage fermé, hauteur normalisée à 1 (axe Y), posé sur y = 0.
 * Retourne { geometrie, taille: {x, y, z} } dans ces unités normalisées.
 */
export function gonfler({ masque, w, h, pixels }, epaisseur = .55) {
  // On travaille sur une grille de sommets (w+1)×(h+1) : un sommet est dans la forme
  // si les 4 pixels qui l'entourent le sont (sommets de bord = au moins un pixel dedans).
  const d = distance(masque, w, h);
  let dmax = 0; for (const v of d) dmax = Math.max(dmax, v);

  // Boîte englobante de la forme
  let x0 = w, x1 = 0, y0 = h, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (masque[y * w + x]) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const hautPx = y1 - y0 + 1, s = 1 / hautPx;
  const cxPx = (x0 + x1 + 1) / 2;

  const V = (w + 1);
  const dedans = (x, y) => x >= 0 && y >= 0 && x < w && y < h && masque[y * w + x];
  const idxAvant = new Int32Array((w + 1) * (h + 1)).fill(-1);
  const idxArriere = new Int32Array((w + 1) * (h + 1)).fill(-1);
  const pos = [], col = [];

  const sommet = (vx, vy) => {
    const k = vy * V + vx;
    if (idxAvant[k] >= 0) return;
    const n = dedans(vx - 1, vy - 1) + dedans(vx, vy - 1) + dedans(vx - 1, vy) + dedans(vx, vy);
    // Épaisseur : section circulaire approchée, nulle sur le contour
    let e = 0;
    if (n === 4) {
      const dd = (d[(vy - 1) * w + vx - 1] + d[(vy - 1) * w + vx] + d[vy * w + vx - 1] + d[vy * w + vx]) / 4;
      const r = Math.max(dmax, 1);
      e = Math.sqrt(Math.max(0, 2 * r * dd - dd * dd)) / r * epaisseur * r;
    }
    const X = (vx - cxPx) * s, Y = (y1 + 1 - vy) * s, Z = e * s;
    // Couleur : pixel le plus proche
    const px = Math.min(w - 1, vx), py = Math.min(h - 1, vy), p = (py * w + px) * 4;
    const r = pixels[p] / 255, g = pixels[p + 1] / 255, b = pixels[p + 2] / 255;
    idxAvant[k] = pos.length / 3; pos.push(X, Y, Z); col.push(r, g, b);
    if (n === 4) { idxArriere[k] = pos.length / 3; pos.push(X, Y, -Z); col.push(r * .8, g * .8, b * .8); }
    else idxArriere[k] = idxAvant[k]; // contour partagé : couture étanche
  };

  const tri = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!masque[y * w + x]) continue;
    const a = y * V + x, b = a + 1, c = a + V, dd = c + 1;
    sommet(x, y); sommet(x + 1, y); sommet(x, y + 1); sommet(x + 1, y + 1);
    // Avant (normale +Z), arrière (normale −Z)
    tri.push(idxAvant[a], idxAvant[c], idxAvant[b], idxAvant[b], idxAvant[c], idxAvant[dd]);
    tri.push(idxArriere[a], idxArriere[b], idxArriere[c], idxArriere[b], idxArriere[dd], idxArriere[c]);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(tri);
  lisser(g, 2);
  g.computeVertexNormals();
  g.computeBoundingBox();
  const bb = g.boundingBox;
  // Pose sur le plancher, centré en X et Z
  g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  g.computeBoundingBox();
  const t = new THREE.Vector3(); g.boundingBox.getSize(t);
  return { geometrie: g, taille: { x: t.x, y: t.y, z: t.z } };
}

// Lissage laplacien léger (atténue l'effet « escalier » des pixels)
function lisser(g, passes) {
  const p = g.attributes.position.array, idx = g.index.array, n = p.length / 3;
  const voisins = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]];
    voisins[a].add(b).add(c); voisins[b].add(a).add(c); voisins[c].add(a).add(b);
  }
  for (let k = 0; k < passes; k++) {
    const q = Float32Array.from(p);
    for (let i = 0; i < n; i++) {
      let sx = 0, sy = 0, sz = 0, m = 0;
      for (const j of voisins[i]) { sx += q[j * 3]; sy += q[j * 3 + 1]; sz += q[j * 3 + 2]; m++; }
      if (!m) continue;
      p[i * 3] = q[i * 3] * .5 + sx / m * .5;
      p[i * 3 + 1] = q[i * 3 + 1] * .5 + sy / m * .5;
      p[i * 3 + 2] = q[i * 3 + 2] * .5 + sz / m * .5;
    }
  }
}
