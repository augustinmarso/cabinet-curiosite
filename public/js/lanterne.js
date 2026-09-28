// La salle obscure en 3D : un meuble à niches, des objets numérisés par le Smithsonian (CC0),
// plongés dans le noir. La lampe suit le pointeur ; un objet longtemps éclairé reste révélé.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const CURIOSITES = [
  { f: 'masque-lincoln.glb', titre: 'Masque de vie de Lincoln', date: 'Clark Mills, 1865', axe: 'passé' },
  { f: 'julodis.glb', titre: 'Bupreste Julodis', date: 'coléoptère-bijou', axe: 'recherche' },
  { f: 'crinoide.glb', titre: 'Lys de mer Endoxocrinus', date: 'crinoïde des grands fonds', axe: 'recherche' },
  { f: 'vase-gong.glb', titre: 'Aiguière rituelle gong', date: 'bronze, Chine ancienne', axe: 'passé' },
  { f: 'chandra.glb', titre: 'Observatoire Chandra', date: 'télescope X, 1999', axe: 'innovation' },
  { vide: true },
  { f: 'trilobite.glb', titre: 'Trilobite Psychopyge', date: 'Dévonien, Maroc', axe: 'passé' },
  { f: 'murex.glb', titre: 'Murex peigne de Vénus', date: 'coquillage', axe: 'recherche' },
  { f: 'apollo11.glb', titre: 'Module Columbia', date: 'Apollo 11, 1969', axe: 'innovation' },
  { f: 'diplocaulus.glb', titre: 'Crâne de Diplocaulus', date: 'amphibien du Permien', axe: 'recherche' },
  { vide: true },
  { f: 'cher-ami.glb', titre: 'Cher Ami', date: 'pigeon voyageur, 1918', axe: 'innovation' },
];
const TOTAL = CURIOSITES.filter(c => !c.vide).length;

const conteneur = document.getElementById('salle-scene');
const canvas = document.getElementById('nuit');
const zoneCartels = document.getElementById('cartels');
const compteur = document.getElementById('compteur');
const charge = document.getElementById('charge');

const rendu = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
rendu.setPixelRatio(Math.min(devicePixelRatio, 1.5));
rendu.outputColorSpace = THREE.SRGBColorSpace;
rendu.toneMapping = THREE.ACESFilmicToneMapping;
rendu.shadowMap.enabled = true;
rendu.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, .1, 100);
const ambiance = new THREE.HemisphereLight(0xffe0b0, 0x0a0806, .04);
scene.add(ambiance);
const lampe = new THREE.SpotLight(0xffc27a, 9, 0, Math.PI / 20, .6, 0);
lampe.castShadow = true;
lampe.shadow.mapSize.set(1024, 1024);
lampe.shadow.bias = -.0004;
scene.add(lampe, lampe.target);
// Halo qui accompagne la lampe (éclaire un peu l'entourage du faisceau)
const halo = new THREE.PointLight(0xff9f4a, 0, 4, 2);
scene.add(halo);

// ─── Le meuble à niches ───
const N = 1, EP = .06, PROF = .8; // taille d'une niche, épaisseur des planches, profondeur
const bois = new THREE.MeshStandardMaterial({ color: 0x3b2616, roughness: .75 });
const fondNiche = new THREE.MeshStandardMaterial({ color: 0x1c130c, roughness: .95 });
const meuble = new THREE.Group();
scene.add(meuble);
let cols = 4, rangs = 3;

function construireMeuble() {
  meuble.clear();
  const W = cols * N + (cols + 1) * EP, H = rangs * N + (rangs + 1) * EP;
  const planche = (w, h, d, x, y, z, m = bois) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    p.position.set(x, y, z); p.castShadow = p.receiveShadow = true; meuble.add(p);
  };
  planche(W, H, EP, 0, 0, -PROF / 2 - EP / 2, fondNiche);
  for (let i = 0; i <= cols; i++) planche(EP, H, PROF, -W / 2 + EP / 2 + i * (N + EP), 0, 0);
  for (let j = 0; j <= rangs; j++) planche(W, EP, PROF, 0, -H / 2 + EP / 2 + j * (N + EP), 0);
  // Corniche et socle
  planche(W + .24, .12, PROF + .2, 0, H / 2 + .06, .02);
  planche(W + .16, .22, PROF + .14, 0, -H / 2 - .11, .02);
  return { W, H };
}

function centreNiche(i) {
  const c = i % cols, r = Math.floor(i / cols);
  const W = cols * N + (cols + 1) * EP, H = rangs * N + (rangs + 1) * EP;
  return new THREE.Vector3(-W / 2 + EP + N / 2 + c * (N + EP), H / 2 - EP - N / 2 - r * (N + EP), 0);
}

// ─── Les objets ───
const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
const chargeur = new GLTFLoader().setDRACOLoader(draco);
const pieces = CURIOSITES.map((c, i) => ({ ...c, i, expo: c.vide ? 1 : 0, revele: false, objet: null, materiaux: [], cartel: null }));

function creerCartel(p) {
  const d = document.createElement('div');
  d.className = 'cartel' + (p.vide ? ' cartel--vide revele' : '');
  if (p.vide) {
    d.innerHTML = '<b>Votre curiosité ici</b>déposez-la dans l\'atelier →';
    d.addEventListener('click', () => document.getElementById('atelier').scrollIntoView({ behavior: 'smooth' }));
  } else {
    d.innerHTML = `<b></b><span></span><br><i>${p.axe}</i>`;
    d.querySelector('b').textContent = p.titre;
    d.querySelector('span').textContent = p.date;
  }
  zoneCartels.appendChild(d);
  p.cartel = d;
}

// Niche vide : une petite nébuleuse de points, promesse de l'objet à venir
function nebuleuse() {
  const n = 700, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const a = new THREE.Color(0x6fa597), b = new THREE.Color(0xc9a45c);
  for (let k = 0; k < n; k++) {
    const r = .32 * Math.cbrt(Math.random()), t = Math.random() * Math.PI * 2, u = Math.acos(2 * Math.random() - 1);
    const bruit = 1 + .35 * Math.sin(t * 3) * Math.sin(u * 4);
    pos.set([r * bruit * Math.sin(u) * Math.cos(t), r * bruit * Math.cos(u) * .8, r * bruit * Math.sin(u) * Math.sin(t)], k * 3);
    const c = a.clone().lerp(b, Math.random());
    col.set([c.r, c.g, c.b], k * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: .018, vertexColors: true, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false }));
}

async function charger(p) {
  const gltf = await chargeur.loadAsync('modeles-salle/' + p.f);
  const o = gltf.scene;
  // Normalisation : la plus grande dimension occupe 64 % de la niche, posé sur le plancher (le haut reste au cartel)
  const b = new THREE.Box3().setFromObject(o), t = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
  const s = N * .64 / Math.max(t.x, t.y, t.z);
  o.position.set(-c.x, -b.min.y, -c.z);
  const pivot = new THREE.Group();
  pivot.add(o); pivot.scale.setScalar(s);
  o.traverse(m => {
    if (!m.isMesh) return;
    m.castShadow = m.receiveShadow = true;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      // Révélation : l'objet s'éclaire de lui-même, via sa propre texture
      mat.emissive = new THREE.Color(0xffe6c4);
      if (mat.map) mat.emissiveMap = mat.map;
      mat.emissiveIntensity = 0;
      p.materiaux.push(mat);
    }
  });
  const place = centreNiche(p.i);
  pivot.position.set(place.x, place.y - N / 2, place.z - .05);
  pivot.rotation.y = (p.i % 3 - 1) * .5;
  meuble.add(pivot);
  p.objet = pivot;
}

// ─── Mise en page : le meuble remplit la zone, en 4×3 (large) ou 3×4 (étroit) ───
let dims;
function dimensionner() {
  const w = conteneur.clientWidth, h = conteneur.clientHeight;
  if (!w || !h) return;
  rendu.setSize(w, h, false);
  camera.aspect = w / h;
  const [c, r] = camera.aspect >= 1 ? [4, 3] : [3, 4];
  if (c !== cols || !dims) {
    cols = c; rangs = r;
    dims = construireMeuble();
    for (const p of pieces) {
      if (p.objet) { const pl = centreNiche(p.i); p.objet.position.set(pl.x, pl.y - N / 2, pl.z - .05); meuble.add(p.objet); }
      if (p.nebuleuse) { p.nebuleuse.position.copy(centreNiche(p.i)); meuble.add(p.nebuleuse); }
    }
  }
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.userData.dist = Math.max((dims.H + .9) / (2 * tan), (dims.W + .5) / (2 * tan * camera.aspect)) + PROF / 2;
  camera.updateProjectionMatrix();
}

// ─── Lampe ───
const pointeur = new THREE.Vector2(0, 0), lisse = new THREE.Vector2(0, 0);
let dansLaSalle = false, toutAllume = false;
conteneur.addEventListener('pointermove', (e) => {
  const r = conteneur.getBoundingClientRect();
  pointeur.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  dansLaSalle = true;
});
conteneur.addEventListener('pointerdown', (e) => conteneur.dispatchEvent(new PointerEvent('pointermove', e)));
conteneur.addEventListener('pointerleave', () => { dansLaSalle = false; });

const rayon = new THREE.Raycaster();
const plan = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const vise = new THREE.Vector3();

function majCompteur() {
  const n = pieces.filter(p => !p.vide && p.revele).length;
  compteur.innerHTML = `<b>${n}</b> / ${TOTAL} curiosités révélées`;
}

document.getElementById('allumer').addEventListener('click', (e) => {
  toutAllume = !toutAllume;
  e.currentTarget.textContent = toutAllume ? 'Éteindre la salle' : 'Allumer la salle';
  if (toutAllume) for (const p of pieces) p.expo = 1;
});

const horloge = new THREE.Clock();
const projete = new THREE.Vector3();
function boucle() {
  const dt = Math.min(horloge.getDelta(), .05), t = horloge.elapsedTime;
  if (dims) {
    lisse.lerp(pointeur, .12);
    // Légère parallaxe : la caméra suit le regard
    const d = camera.userData.dist;
    camera.position.set(lisse.x * .35, lisse.y * .25, d);
    camera.lookAt(0, 0, 0);

    rayon.setFromCamera(lisse, camera);
    rayon.ray.intersectPlane(plan, vise);
    const allumee = dansLaSalle || toutAllume;
    lampe.position.copy(camera.position).add(new THREE.Vector3(.4, .6, -1));
    lampe.target.position.copy(vise).setZ(-PROF / 3);
    lampe.intensity = allumee ? 9 * (1 + Math.sin(t * 9) * .02 + Math.sin(t * 23) * .015) : 0;
    halo.position.copy(vise).setZ(.9);
    halo.intensity = allumee ? .5 : 0;
    ambiance.intensity += ((toutAllume ? 1.1 : .04) - ambiance.intensity) * .05;

    for (const p of pieces) {
      const c = centreNiche(p.i);
      if (!p.vide && dansLaSalle && Math.hypot(vise.x - c.x, vise.y - c.y) < N * .55) p.expo = Math.min(1, p.expo + dt / 1.1);
      if (p.objet) {
        for (const m of p.materiaux) m.emissiveIntensity = p.expo * .32;
        p.objet.rotation.y += dt * .15 * p.expo;
      }
      if (p.nebuleuse) { p.nebuleuse.rotation.y = t * .3; p.nebuleuse.rotation.x = Math.sin(t * .4) * .2; }
      if (!p.vide && !p.revele && p.expo >= 1) { p.revele = true; p.cartel?.classList.add('revele'); majCompteur(); }
      // Cartel en haut de la niche (l'objet occupe le bas)
      if (p.cartel) {
        projete.set(c.x, c.y + N / 2 - .04, PROF / 2).project(camera);
        p.cartel.style.left = ((projete.x + 1) / 2 * conteneur.clientWidth) + 'px';
        p.cartel.style.top = ((1 - projete.y) / 2 * conteneur.clientHeight) + 'px';
      }
    }
    rendu.render(scene, camera);
  }
  requestAnimationFrame(boucle);
}

new ResizeObserver(dimensionner).observe(conteneur);
dimensionner();
pieces.forEach(creerCartel);
for (const p of pieces.filter(p => p.vide)) { p.nebuleuse = nebuleuse(); p.nebuleuse.position.copy(centreNiche(p.i)); meuble.add(p.nebuleuse); }
majCompteur();
requestAnimationFrame(boucle);

// Chargement progressif, les plus légers d'abord
let charges = 0;
Promise.all(pieces.filter(p => !p.vide).map(p => charger(p)
  .catch(e => console.warn('modèle', p.f, e.message))
  .finally(() => { charge.textContent = `${++charges} / ${TOTAL} curiosités installées`; })))
  .then(() => { charge.textContent = 'Prenez la lampe.'; setTimeout(() => charge.remove(), 2500); });
