// La salle obscure : une seule curiosité, la main droite d'Abraham Lincoln (moulage de Leonard Volk, 1860,
// Smithsonian Open Access, CC0). La lampe suit le pointeur ; au-dessus de la main, elle passe derrière :
// la main se découpe en contre-jour et la flamme disparaît derrière les doigts.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const conteneur = document.getElementById('salle-scene');
const canvas = document.getElementById('nuit');
const compteur = document.getElementById('compteur');
const charge = document.getElementById('charge');
const lignes = [...document.querySelectorAll('#cartels .cartel__ligne')];
const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;

const rendu = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
rendu.setPixelRatio(Math.min(devicePixelRatio, 1.5));
rendu.outputColorSpace = THREE.SRGBColorSpace;
rendu.toneMapping = THREE.ACESFilmicToneMapping;
rendu.shadowMap.enabled = true;
rendu.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, .1, 50);
const ambiance = new THREE.HemisphereLight(0xffe0b0, 0x0a0806, .03);
scene.add(ambiance);

// Fond de velours : c'est lui qui s'illumine quand la lampe passe derrière la main
const FOND_Z = -1.6;
const fond = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: .95 }));
fond.position.z = FOND_Z; fond.receiveShadow = true;
scene.add(fond);

// La lampe : une vraie lumière + une flamme visible (masquée par la main quand elle est derrière)
const lampe = new THREE.PointLight(0xffd8a8, 0, 7, 1.6);
lampe.castShadow = true;
lampe.shadow.mapSize.set(1024, 1024);
lampe.shadow.bias = -.002;
scene.add(lampe);
function sprite(taille, couleur, opacite) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), d = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  d.addColorStop(0, `rgba(${couleur},1)`); d.addColorStop(.25, `rgba(${couleur},.55)`); d.addColorStop(1, `rgba(${couleur},0)`);
  g.fillStyle = d; g.fillRect(0, 0, 128, 128);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: opacite }));
  s.scale.setScalar(taille);
  return s;
}
const flamme = sprite(.28, '255,214,150', 1);
const halo = sprite(3.4, '255,160,80', .35);
scene.add(flamme, halo);

// ─── La main ───
const main = new THREE.Group();
scene.add(main);
const materiaux = [];
let maillages = [];
const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
new GLTFLoader().setDRACOLoader(draco).loadAsync('modeles-salle/main-lincoln.glb').then((gltf) => {
  const o = gltf.scene;
  const b = new THREE.Box3().setFromObject(o), t = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
  const k = 1.35 / Math.max(t.x, t.y, t.z); // environ 1,35 unité de long
  o.scale.setScalar(k);
  o.position.set(-c.x * k, -b.min.y * k, -c.z * k);
  o.traverse(m => {
    if (!m.isMesh) return;
    m.castShadow = m.receiveShadow = true;
    maillages.push(m);
    for (const mat of [].concat(m.material)) {
      // Lueur du plâtre : la lumière « traverse » un peu la main quand elle est derrière
      mat.emissive = new THREE.Color(0xffb070);
      if (mat.map) mat.emissiveMap = mat.map;
      mat.emissiveIntensity = 0;
      materiaux.push(mat);
    }
  });
  main.add(o);
  main.rotation.y = -.35;
  charge.textContent = 'Prenez la lampe.';
  setTimeout(() => charge.remove(), 2500);
}).catch((e) => { charge.textContent = 'La main n\'a pas pu être chargée.'; console.error(e); });

// ─── Mise en page ───
function dimensionner() {
  const w = conteneur.clientWidth, h = conteneur.clientHeight;
  if (!w || !h) return;
  rendu.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// ─── Pointeur ───
const pointeur = new THREE.Vector2(0, 0), lisse = new THREE.Vector2(0, 0);
let dansLaSalle = false, toutAllume = false;
conteneur.addEventListener('pointermove', (e) => {
  const r = conteneur.getBoundingClientRect();
  pointeur.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  dansLaSalle = true;
});
conteneur.addEventListener('pointerdown', (e) => conteneur.dispatchEvent(new PointerEvent('pointermove', e)));
conteneur.addEventListener('pointerleave', () => { dansLaSalle = false; });

document.getElementById('allumer').addEventListener('click', (e) => {
  toutAllume = !toutAllume;
  e.currentTarget.textContent = toutAllume ? 'Éteindre la salle' : 'Allumer la salle';
  if (toutAllume) expo = 1;
});

// Exposition : plus la main reçoit de lumière, plus elle se révèle, et son cartel avec
let expo = 0, profondeur = 1; // profondeur : 1 = lampe devant, 0 = lampe derrière
const rayon = new THREE.Raycaster();
const plan = new THREE.Plane(new THREE.Vector3(0, 0, 1), -.2);
const vise = new THREE.Vector3(), centreMain = new THREE.Vector3(0, .45, 0);
const horloge = new THREE.Clock();

function majCartel() {
  const pct = Math.round(expo * 100);
  compteur.innerHTML = `Main révélée à <b>${pct} %</b>`;
  lignes.forEach((l, i) => l.classList.toggle('revele', expo >= (i + 1) / (lignes.length + .5)));
}

function boucle() {
  requestAnimationFrame(boucle);
  if (!conteneur.clientWidth) return;
  const dt = Math.min(horloge.getDelta(), .05), t = horloge.elapsedTime;
  lisse.lerp(pointeur, .1);

  // Caméra qui tourne un peu autour de la main selon le regard
  const ang = lisse.x * .35;
  const dist = 5 / Math.min(1, camera.aspect * 1.1);
  camera.position.set(Math.sin(ang) * dist, 1.1 + lisse.y * .35, Math.cos(ang) * dist);
  camera.lookAt(0, .45, 0);

  rayon.setFromCamera(lisse, camera);
  rayon.ray.intersectPlane(plan, vise);
  const surLaMain = dansLaSalle && maillages.length && rayon.intersectObjects(maillages, false).length > 0;
  // La lampe glisse derrière la main quand on la passe dessus
  profondeur += ((surLaMain ? 0 : 1) - profondeur) * (reduit ? 1 : .06);
  const z = THREE.MathUtils.lerp(FOND_Z + .55, 1.3, profondeur);
  lampe.position.set(vise.x, Math.max(.1, vise.y), z);
  flamme.position.copy(lampe.position);
  halo.position.set(lampe.position.x, lampe.position.y, Math.min(z, FOND_Z + .2));

  const allumee = dansLaSalle || toutAllume;
  const vacille = 1 + Math.sin(t * 9) * .03 + Math.sin(t * 23) * .02;
  lampe.intensity = allumee ? (4 + (1 - profondeur) * 1.6) * vacille : 0;
  flamme.material.opacity = allumee ? 1 : 0;
  halo.material.opacity = allumee ? (.15 + (1 - profondeur) * .85) * vacille : 0;
  // Mémoire de la lumière : une main révélée reste doucement visible dans le noir
  ambiance.intensity += ((toutAllume ? 1.2 : .03 + expo * .3) - ambiance.intensity) * .05;

  // Révélation : proximité de la lampe (devant comme derrière)
  if (dansLaSalle && maillages.length) {
    const proche = Math.max(0, 1 - lampe.position.distanceTo(centreMain) / 1.8);
    expo = Math.min(1, expo + dt * proche * .12);
  }
  const contreJour = (1 - profondeur) * (allumee ? 1 : 0);
  // Contre-jour : le plâtre laisse à peine passer la lumière
  for (const m of materiaux) m.emissiveIntensity = contreJour * .045 * vacille;
  majCartel();

  rendu.render(scene, camera);
}

new ResizeObserver(dimensionner).observe(conteneur);
dimensionner();
majCartel();
requestAnimationFrame(boucle);
