// Le laboratoire : un bento « numérique ».
// Tout y est vrai : la nébuleuse est faite du code source du site, les exemples d'échelle
// sont calculés par meuble.js, les entures sont tracées par laser.js.
import { hauteurImprimee, fmt } from './meuble.js';
import { panneauxBoite } from './laser.js';

const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
const GLYPHES = '░▒▓<>/\\{}[]=+*#01;:$%&';

// ─── Scramble (d'après les effets « scramble-in / scramble-hover » du registre @fancy) ───
export function brouiller(el, duree = 900) {
  if (reduit) return;
  const final = el.dataset.texte ??= el.textContent;
  const debut = performance.now();
  cancelAnimationFrame(el._brouille);
  const pas = () => {
    const k = Math.min(1, (performance.now() - debut) / duree);
    const fixe = Math.floor(final.length * k);
    el.textContent = final.split('').map((c, i) => i < fixe || c === ' ' ? c : GLYPHES[(Math.random() * GLYPHES.length) | 0]).join('');
    if (k < 1) el._brouille = requestAnimationFrame(pas);
  };
  pas();
}

const visible = new IntersectionObserver((entrees) => {
  for (const e of entrees) if (e.isIntersecting) { e.target.dispatchEvent(new Event('visible')); visible.unobserve(e.target); }
}, { threshold: .35 });

document.querySelectorAll('[data-scramble]').forEach(el => {
  el.addEventListener('visible', () => brouiller(el, 1100));
  el.closest('.case, section')?.addEventListener('pointerenter', () => brouiller(el, 600));
  visible.observe(el);
});

// ─── Lumière qui suit le pointeur sur toute la grille ───
const grille = document.querySelector('.bento__grille');
grille?.addEventListener('pointermove', (e) => {
  for (const c of grille.children) {
    const r = c.getBoundingClientRect();
    c.style.setProperty('--mx', `${e.clientX - r.left}px`);
    c.style.setProperty('--my', `${e.clientY - r.top}px`);
  }
});

// ─── 01 · Nébuleuse de code ───
async function nebuleuse(canvas) {
  const sources = await Promise.all(['js/laser.js', 'js/meuble.js', 'js/silhouette.js', 'js/modeles3d.js']
    .map(f => fetch(f).then(r => r.text()).catch(() => '')));
  const code = sources.join(' ').replace(/\s+/g, ' ');
  const ctx = canvas.getContext('2d');
  const CW = 9, CH = 14;
  let cols = 0, lignes = 0, dpr = 1;
  const souris = { x: -1e3, y: -1e3 };
  canvas.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); souris.x = e.clientX - r.left; souris.y = e.clientY - r.top; });
  canvas.addEventListener('pointerleave', () => { souris.x = souris.y = -1e3; });

  function taille() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(w / CW); lignes = Math.ceil(h / CH);
  }
  new ResizeObserver(taille).observe(canvas);
  taille();

  // Bruit de valeur 3D, lissé (sans dépendance)
  const hache = (x, y, z) => { let h = x * 374761393 + y * 668265263 + z * 1442695041; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  const lisse = (t) => t * t * (3 - 2 * t);
  function bruit(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = lisse(x - xi), yf = lisse(y - yi), zf = lisse(z - zi);
    let v = 0;
    for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      v += hache(xi + dx, yi + dy, zi + dz) * (dx ? xf : 1 - xf) * (dy ? yf : 1 - yf) * (dz ? zf : 1 - zf);
    }
    return v;
  }
  const fbm = (x, y, z) => bruit(x, y, z) * .55 + bruit(x * 2.1, y * 2.1, z * 1.7) * .3 + bruit(x * 4.3, y * 4.3, z * 2.9) * .15;

  let dernier = 0;
  function dessiner(t) {
    requestAnimationFrame(dessiner);
    if (t - dernier < 33 || !cols) return; // ~30 i/s suffisent
    dernier = t;
    const z = reduit ? 0 : t / 9000;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `12px 'IBM Plex Mono', monospace`;
    ctx.textBaseline = 'top';
    const defile = Math.floor(t / 180); // le code s'écoule lentement
    for (let j = 0; j < lignes; j++) for (let i = 0; i < cols; i++) {
      const x = i * CW, y = j * CH;
      // Deux nuages qui se croisent, plus denses vers le centre
      const cx = i / cols - .5, cy = j / lignes - .5;
      let d = fbm(i * .06, j * .09, z) * 1.25 - Math.hypot(cx * 1.1, cy * 1.3) * .9;
      const dm = Math.hypot(souris.x - x, souris.y - y);
      const lampe = Math.max(0, 1 - dm / 120);
      d += lampe * .5;
      if (d < .2) continue;
      const a = Math.min(1, (d - .2) * 2.2);
      const teinte = fbm(i * .03 + 40, j * .03, z * .6);
      // vert-de-gris → laiton, parchemin sous la lampe
      const r = lampe > .2 ? 236 : 111 + (201 - 111) * teinte, g = lampe > .2 ? 223 : 165 + (164 - 165) * teinte, b = lampe > .2 ? 195 : 151 + (92 - 151) * teinte;
      ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${a * (lampe > .2 ? 1 : .8)})`;
      const c = lampe > .55 && Math.random() < .3 ? GLYPHES[(Math.random() * GLYPHES.length) | 0] : code[(j * 131 + i + defile) % code.length];
      ctx.fillText(c, x, y);
    }
  }
  requestAnimationFrame(dessiner);
}

// ─── 02 · Échelle : exemples calculés par meuble.js ───
function echelle(zone) {
  const EXEMPLES = [
    { nom: 'Crâne de renard', h: 14 }, { nom: 'Astrolabe', h: 21.6 }, { nom: 'Puce de Hooke', h: .25 },
    { nom: 'Module Apollo 11', h: 323 }, { nom: 'Coupe en nautile', h: 27.9 },
  ];
  const [ech, barre, legende] = ['.echelle__rapport', '.echelle__barre i', '.echelle__legende'].map(s => zone.querySelector(s));
  let n = 0;
  const suivant = () => {
    const ex = EXEMPLES[n % EXEMPLES.length], e = n % 2 ? .5 : .2;
    const { h, horsEchelle } = hauteurImprimee(ex.h, e);
    ech.textContent = e === .2 ? '1/5' : '1/2'; brouiller(ech, 500);
    barre.style.height = Math.min(100, h / 30 * 100) + '%';
    legende.textContent = `${ex.nom} · ${fmt(ex.h)} cm → ${fmt(h)} cm${horsEchelle ? ' · ' + horsEchelle : ''}`;
    brouiller(legende, 700);
    n++;
  };
  suivant();
  if (!reduit) setInterval(suivant, 3200);
}

// ─── 03 · Moteurs : un terminal qui tape la chaîne de fabrication ───
function terminal(zone) {
  const LIGNES = [
    ['$ ', 'gemini.estimer("astrolabe.jpg")'], ['→ ', 'hauteur 21,6 cm · confiance 0,8'],
    ['$ ', 'fal.trellis(image)'], ['→ ', 'apercu.glb · 0,02 $'],
    ['$ ', 'fal.hunyuan3d(image)'], ['→ ', 'impression.stl · 0,16 $'],
    ['$ ', 'laser.entures(boite, 3 mm)'], ['→ ', 'plateau-1.svg · 12 pièces'],
  ];
  const pre = zone.querySelector('pre');
  let ligne = 0, car = 0;
  const taper = () => {
    if (ligne >= LIGNES.length) { setTimeout(() => { pre.textContent = ''; ligne = car = 0; taper(); }, 2600); return; }
    const [p, txt] = LIGNES[ligne];
    if (car === 0) pre.append(Object.assign(document.createElement('span'), { className: p === '$ ' ? 'cmd' : 'res', textContent: p }));
    pre.lastChild.textContent += txt[car++] ?? '';
    if (car > txt.length) { pre.append('\n'); ligne++; car = 0; setTimeout(taper, 380); }
    else setTimeout(taper, p === '$ ' ? 38 : 12);
  };
  zone.addEventListener('visible', taper, { once: true });
  visible.observe(zone);
  if (reduit) pre.textContent = LIGNES.map(l => l.join('')).join('\n');
}

// ─── 04 · Entures : tracées par le vrai générateur laser ───
function entures(zone) {
  const [fond, , , cote] = panneauxBoite({ W: 90, H: 60, D: 45 }, 3, 'B1', '');
  const chemin = (p) => 'M' + p.contour.map(q => q.join(',')).join('L') + 'Z';
  const svg = zone.querySelector('svg');
  svg.setAttribute('viewBox', '-4 -4 158 68');
  svg.innerHTML = `<path d="${chemin(fond)}"/><path transform="translate(104,0)" d="${chemin(cote)}"/>`;
  svg.querySelectorAll('path').forEach(p => { const l = p.getTotalLength(); p.style.setProperty('--l', l); });
  zone.addEventListener('visible', () => zone.classList.add('trace'), { once: true });
  visible.observe(zone);
}

const q = (s) => document.querySelector(s);
if (q('#nebuleuse')) nebuleuse(q('#nebuleuse'));
if (q('.case--echelle')) echelle(q('.case--echelle'));
if (q('.case--moteurs')) terminal(q('.case--moteurs'));
if (q('.case--entures')) entures(q('.case--entures'));
