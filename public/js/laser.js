// Boîtes à entures (finger joints) pour découpe laser, face avant ouverte. Unités : mm.
// Convention des coins : le fond possède les 4 coins arrière, le dessus/dessous possèdent les coins avant.

const COUPE = '#ff0000', GRAVURE = '#0000ff';

/** Profondeurs de chaque segment d'un bord : 0 = matière jusqu'au bord, t = entaille. */
function profil(L, type, t) {
  if (type === 'F') return { u: [0, L], d: [0] };
  let n = Math.floor(L / Math.max(3 * t, 8));
  if (n % 2 === 0) n--;
  n = Math.max(3, n);
  const u = Array.from({ length: n + 1 }, (_, i) => L * i / n);
  const d = Array.from({ length: n }, (_, i) => ((i % 2 === 0) === (type === 'P')) ? 0 : t);
  return { u, d };
}

/** Contour d'un panneau a×b ; bords dans l'ordre haut, droite, bas, gauche (sens horaire, y vers le bas). */
function panneau(a, b, types, t) {
  const bords = [
    { S: [0, 0], dir: [1, 0], dedans: [0, 1], L: a },
    { S: [a, 0], dir: [0, 1], dedans: [-1, 0], L: b },
    { S: [a, b], dir: [-1, 0], dedans: [0, -1], L: a },
    { S: [0, b], dir: [0, -1], dedans: [1, 0], L: b },
  ].map((e, i) => ({ ...e, ...profil(e.L, types[i], t) }));

  const pts = [];
  bords.forEach((e, i) => {
    const avant = bords[(i + 3) % 4], apres = bords[(i + 1) % 4];
    const n = e.d.length;
    for (let k = 0; k < n; k++) {
      const u0 = k === 0 ? avant.d[avant.d.length - 1] : e.u[k];
      const u1 = k === n - 1 ? e.L - apres.d[0] : e.u[k + 1];
      for (const u of [u0, u1]) {
        pts.push([e.S[0] + e.dir[0] * u + e.dedans[0] * e.d[k], e.S[1] + e.dir[1] * u + e.dedans[1] * e.d[k]]);
      }
    }
  });
  return simplifier(pts);
}

function simplifier(pts) {
  const eq = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6;
  let r = pts.filter((p, i) => !eq(p, pts[(i + 1) % pts.length]));
  // Retire les points alignés
  let change = true;
  while (change) {
    change = false;
    r = r.filter((p, i) => {
      const a = r[(i - 1 + r.length) % r.length], c = r[(i + 1) % r.length];
      const col = Math.abs((p[0] - a[0]) * (c[1] - a[1]) - (p[1] - a[1]) * (c[0] - a[0])) < 1e-6;
      if (col) change = true;
      return !col;
    });
  }
  return r;
}

/** Décalage vers l'extérieur de k (polygone orthogonal, sens horaire) : compense la largeur du faisceau. */
function decaler(pts, k) {
  if (!k) return pts;
  const n = pts.length;
  const normale = (p, q) => { const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy); return [dy / l, -dx / l]; };
  return pts.map((p, i) => {
    const n1 = normale(pts[(i - 1 + n) % n], p), n2 = normale(p, pts[(i + 1) % n]);
    return [p[0] + k * (n1[0] + n2[0]), p[1] + k * (n1[1] + n2[1])];
  });
}

/** Les 5 panneaux d'une boîte de dimensions extérieures W×H×D (mm). */
export function panneauxBoite({ W, H, D }, t, code, gravure) {
  return [
    { nom: 'fond', a: W, b: H, types: ['P', 'P', 'P', 'P'], texte: gravure },
    { nom: 'dessus', a: W, b: D, types: ['N', 'P', 'F', 'P'] },
    { nom: 'dessous', a: W, b: D, types: ['N', 'P', 'F', 'P'] },
    { nom: 'côté G', a: D, b: H, types: ['N', 'F', 'N', 'N'] },
    { nom: 'côté D', a: D, b: H, types: ['N', 'F', 'N', 'N'] },
  ].map(p => ({ ...p, code, contour: panneau(p.a, p.b, p.types, t) }));
}

/** Imbrication simple par rangées sur des plateaux L×l ; les pièces trop grandes vont sur un plateau à part. */
export function imbriquer(pieces, plateau, kerf) {
  const MARGE = 5, ECART = 4;
  const [PL, PH] = plateau;
  const tri = pieces.map(p => {
    // On couche la pièce si elle tient mieux ainsi
    const couchee = p.b > p.a && p.b <= PL - 2 * MARGE;
    return { ...p, rot: couchee, w: (couchee ? p.b : p.a) + kerf, h: (couchee ? p.a : p.b) + kerf };
  }).sort((a, b) => b.h - a.h);

  const plateaux = [];
  const nouveau = (hors) => { const p = { hors, pieces: [], x: MARGE, y: MARGE, hRang: 0, L: PL, H: PH }; plateaux.push(p); return p; };
  for (const p of tri) {
    if (p.w > PL - 2 * MARGE || p.h > PH - 2 * MARGE) {
      const s = nouveau(true); s.L = p.w + 2 * MARGE; s.H = p.h + 2 * MARGE;
      s.pieces.push({ ...p, x: MARGE, y: MARGE }); continue;
    }
    let place = false;
    for (const s of plateaux.filter(s => !s.hors)) {
      if (s.x + p.w > PL - MARGE) { s.x = MARGE; s.y += s.hRang + ECART; s.hRang = 0; }
      if (s.y + p.h <= PH - MARGE) {
        s.pieces.push({ ...p, x: s.x, y: s.y });
        s.x += p.w + ECART; s.hRang = Math.max(s.hRang, p.h); place = true; break;
      }
    }
    if (!place) {
      const s = nouveau(false);
      s.pieces.push({ ...p, x: s.x, y: s.y }); s.x += p.w + ECART; s.hRang = p.h;
    }
  }
  return plateaux;
}

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function svgPlateau(s, kerf) {
  const f = (v) => +v.toFixed(3);
  const corps = s.pieces.map(p => {
    const pts = decaler(p.contour, kerf / 2);
    const d = 'M' + pts.map(q => `${f(q[0])},${f(q[1])}`).join('L') + 'Z';
    // Pièce couchée : rotation de 90° autour de l'origine puis translation
    const tr = p.rot ? `translate(${f(p.x + p.b + kerf / 2)},${f(p.y + kerf / 2)}) rotate(90)` : `translate(${f(p.x + kerf / 2)},${f(p.y + kerf / 2)})`;
    const cx = p.a / 2, cy = p.b / 2;
    const etiquette = `<text x="${f(cx)}" y="${f(Math.min(p.b - 3, cy + (p.texte ? 9 : 1.5)))}" font-size="3.2" text-anchor="middle">${esc(p.code)} · ${esc(p.nom)}</text>`;
    const texte = p.texte ? `<text x="${f(cx)}" y="${f(cy)}" font-size="${f(Math.min(6, p.a / 14))}" text-anchor="middle">${esc(p.texte)}</text>` : '';
    return `<g transform="${tr}"><path d="${d}" fill="none" stroke="${COUPE}" stroke-width="0.1"/><g fill="${GRAVURE}" font-family="Arial, sans-serif">${etiquette}${texte}</g></g>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${s.L}mm" height="${s.H}mm" viewBox="0 0 ${s.L} ${s.H}">
<!-- Rouge : découpe · Bleu : gravure · unités mm -->
${corps}
</svg>`;
}
