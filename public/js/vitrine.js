// Vitrine 3D : le meuble, ses boîtes et ses objets, éclairés à la lampe. Unités : cm.
// Chaque changement (ajout, échelle, réglage) est animé : le meuble grandit, les boîtes glissent à leur place.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const DUREE = 800; // ms
const doux = (x) => 1 - Math.pow(1 - x, 3);
const mix = (a, b, k) => a + (b - a) * k;
const mixV = (a, b, k) => ({ x: mix(a.x, b.x, k), y: mix(a.y, b.y, k), z: mix(a.z, b.z, k) });

export function creerVitrine(conteneur) {
  const rendu = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  rendu.setPixelRatio(Math.min(devicePixelRatio, 2));
  rendu.shadowMap.enabled = true;
  rendu.shadowMap.type = THREE.PCFSoftShadowMap;
  rendu.outputColorSpace = THREE.SRGBColorSpace;
  rendu.toneMapping = THREE.ACESFilmicToneMapping;
  conteneur.appendChild(rendu.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070605);
  scene.fog = new THREE.Fog(0x070605, 200, 600);

  const camera = new THREE.PerspectiveCamera(35, 1, 1, 2000);
  camera.position.set(0, 30, 120);
  const controles = new OrbitControls(camera, rendu.domElement);
  controles.enableDamping = true;
  controles.maxPolarAngle = Math.PI * .55;
  let cameraCible = null;
  controles.addEventListener('start', () => { cameraCible = null; }); // l'utilisateur reprend la main

  // Obscurité : un souffle d'ambiance, et une lampe tenue près de l'œil
  const ambiance = new THREE.HemisphereLight(0xffe2b0, 0x1a1208, .06);
  scene.add(ambiance);
  const salle = new THREE.DirectionalLight(0xfff0d8, 0);
  salle.position.set(40, 80, 100);
  scene.add(salle);
  const lampe = new THREE.SpotLight(0xffc98a, 900, 0, Math.PI / 11, .55, 1.6);
  lampe.castShadow = true;
  lampe.shadow.mapSize.set(1024, 1024);
  lampe.shadow.bias = -.0005;
  scene.add(lampe, lampe.target);

  const sol = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: 0x14100b, roughness: 1 }));
  sol.rotation.x = -Math.PI / 2; sol.receiveShadow = true;
  scene.add(sol);

  const bois = new THREE.MeshStandardMaterial({ color: 0x9a7248, roughness: .8 });
  const boisMeuble = new THREE.MeshStandardMaterial({ color: 0x4a3120, roughness: .7 });
  const groupe = new THREE.Group();
  scene.add(groupe);

  // ─── Caisses faites de planches unitaires : on les redimensionne sans les reconstruire ───
  const cube = new THREE.BoxGeometry(1, 1, 1);
  function caisse(materiau) {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(cube, materiau);
      m.castShadow = m.receiveShadow = true; g.add(m);
    }
    return g;
  }
  function dimensionnerCaisse(g, { x: W, y: H, z: D }, e) {
    const p = g.children;
    const pose = (m, sx, sy, sz, x, y, z) => { m.scale.set(sx, sy, sz); m.position.set(x, y, z); };
    pose(p[0], W, H, e, 0, H / 2, -D / 2 + e / 2);                   // fond
    pose(p[1], W, e, D - e, 0, e / 2, e / 2);                         // dessous
    pose(p[2], W, e, D - e, 0, H - e / 2, e / 2);                     // dessus
    pose(p[3], e, H - 2 * e, D - e, -W / 2 + e / 2, H / 2, e / 2);    // côtés
    pose(p[4], e, H - 2 * e, D - e, W / 2 - e / 2, H / 2, e / 2);
  }

  const SOCLE = 4;
  const meuble = caisse(boisMeuble);
  const pied = new THREE.Mesh(cube, boisMeuble);
  pied.castShadow = true;
  meuble.position.y = SOCLE;
  groupe.add(meuble, pied);
  meuble.visible = pied.visible = false;

  // État courant (ce qui est affiché) et animation en cours
  let courant = { ext: { x: 1, y: 1, z: 1 }, items: new Map() };
  let anim = null;
  let epaisseur = .3;

  // ─── Lampe qui suit le pointeur ───
  const pointeur = new THREE.Vector2(0, 0);
  const rayon = new THREE.Raycaster();
  let survol = false;
  rendu.domElement.addEventListener('pointermove', (e) => {
    const r = rendu.domElement.getBoundingClientRect();
    pointeur.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    survol = true;
  });
  rendu.domElement.addEventListener('pointerleave', () => { survol = false; });
  const cible = new THREE.Vector3();

  function taille() {
    const w = conteneur.clientWidth, h = conteneur.clientHeight;
    if (!w || !h) return;
    rendu.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(taille).observe(conteneur);
  taille();

  function poser(k) {
    const e = epaisseur;
    const ext = mixV(anim.de.ext, anim.vers.ext, k);
    dimensionnerCaisse(meuble, ext, e);
    pied.scale.set(Math.max(1, ext.x - 2), SOCLE, Math.max(1, ext.z - 2));
    pied.position.set(0, SOCLE / 2, 0);
    const zFond = -ext.z / 2 + e;
    for (const it of anim.items) {
      const pos = mixV(it.de.pos, it.vers.pos, k);
      const bExt = mixV(it.de.ext, it.vers.ext, k), bInt = mixV(it.de.int, it.vers.int, k);
      const apparition = it.nouveau ? k : 1;
      const baseY = SOCLE + e + pos.y + (1 - apparition) * 25; // les nouvelles boîtes descendent se ranger
      dimensionnerCaisse(it.caisse, bExt, e);
      it.caisse.position.set(pos.x, baseY, zFond + bExt.z / 2);
      it.caisse.scale.setScalar(Math.max(.001, apparition));
      it.objet.scale.setScalar(mix(it.de.k, it.vers.k, k) * Math.max(.001, apparition));
      it.objet.position.set(pos.x, baseY + e * apparition, zFond + e + bInt.z / 2);
    }
  }

  function boucle(t) {
    if (anim) {
      const k = Math.min(1, (performance.now() - anim.debut) / DUREE);
      poser(doux(k));
      if (k >= 1) anim = null;
    }
    if (cameraCible) {
      camera.position.lerp(cameraCible.pos, .08);
      controles.target.lerp(cameraCible.cible, .08);
      if (camera.position.distanceTo(cameraCible.pos) < .05) cameraCible = null;
    }
    controles.update();
    // La lampe est tenue un peu au-dessus et à droite de la caméra
    const decal = new THREE.Vector3(12, 10, 0).applyQuaternion(camera.quaternion);
    lampe.position.copy(camera.position).add(decal);
    rayon.setFromCamera(survol ? pointeur : new THREE.Vector2(0, .1), camera);
    const touche = rayon.intersectObjects([groupe, sol], true)[0];
    cible.lerp(touche ? touche.point : controles.target, .15);
    lampe.target.position.copy(cible);
    lampe.intensity = 900 * (1 + Math.sin(t / 110) * .03);
    if (conteneur.clientWidth) rendu.render(scene, camera);
    requestAnimationFrame(boucle);
  }
  requestAnimationFrame(boucle);

  let dernier = null;
  function cadrer(immediat = false) {
    if (!dernier) return;
    const ext = dernier, h = ext.y + SOCLE, tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // Distance pour faire tenir la hauteur ET la largeur (fov horizontal = vertical × aspect)
    const dist = Math.max(h / (2 * tanV), ext.x / (2 * tanV * camera.aspect)) * 1.3 + ext.z / 2;
    cameraCible = { pos: new THREE.Vector3(dist * .12, h / 2 + dist * .06, dist), cible: new THREE.Vector3(0, h / 2, 0) };
    if (immediat) { camera.position.copy(cameraCible.pos); controles.target.copy(cameraCible.cible); cameraCible = null; }
  }

  let premier = true;
  return {
    /**
     * objets : [{ id, maillage (hauteur 1), k (échelle en cm), boite, position }]
     * meuble : { largeur, hauteur, profondeur } (intérieur), e : épaisseur des planches
     */
    afficher(objets, agencement, e) {
      epaisseur = e;
      const vide = !objets.length;
      meuble.visible = pied.visible = !vide;
      const ext = vide ? { x: 1, y: 1, z: 1 } : { x: agencement.largeur + 2 * e, y: agencement.hauteur + 2 * e, z: agencement.profondeur + e };

      // Si une animation tourne, on repart de l'état affiché à cet instant
      const de = anim ? { ext: mixV(anim.de.ext, anim.vers.ext, doux(Math.min(1, (performance.now() - anim.debut) / DUREE))) } : { ext: courant.ext };
      const nouveaux = new Map(), items = [];
      for (const o of objets) {
        const avant = courant.items.get(o.id);
        const c = avant?.caisse || caisse(bois);
        if (avant) groupe.remove(avant.objet);
        groupe.add(c, o.maillage);
        const vers = { pos: o.position, ext: o.boite.ext, int: o.boite.int, k: o.k };
        const it = { caisse: c, objet: o.maillage, vers, nouveau: !avant, de: avant ? avant.etat : vers };
        items.push(it);
        nouveaux.set(o.id, { caisse: c, objet: o.maillage, etat: vers });
      }
      // Boîtes retirées
      for (const [id, it] of courant.items) if (!nouveaux.has(id)) groupe.remove(it.caisse, it.objet);

      anim = { debut: performance.now(), de: premier ? { ext } : de, vers: { ext }, items };
      poser(0);
      courant = { ext, items: nouveaux };
      if (!vide) { dernier = ext; if (premier) { premier = false; cadrer(true); } }
    },
    cadrer: () => cadrer(false),
    eclairer(allume) {
      ambiance.intensity = allume ? .9 : .06;
      salle.intensity = allume ? 2.2 : 0;
    },
    capture() { return rendu.domElement.toDataURL('image/jpeg', .8); },
    vignette,
  };

  /** Petite image d'un objet normalisé (hauteur 1), pour les modèles sans photo. */
  function vignette(objet3d, cote = 192) {
    const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    r.setSize(cote, cote); r.outputColorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Scene(); s.background = new THREE.Color(0x221c16);
    s.add(new THREE.HemisphereLight(0xfff2dd, 0x221c16, 2.2));
    const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(1, 2, 2); s.add(d);
    const o = objet3d.clone(); s.add(o);
    const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3()), t = b.getSize(new THREE.Vector3());
    const cam = new THREE.PerspectiveCamera(30, 1, .01, 100);
    const dist = Math.max(t.x, t.y) / (2 * Math.tan(THREE.MathUtils.degToRad(15))) * 1.2;
    cam.position.set(c.x + dist * .25, c.y + dist * .15, c.z + dist); cam.lookAt(c);
    r.render(s, cam);
    const url = r.domElement.toDataURL('image/jpeg', .85);
    r.dispose(); r.forceContextLoss();
    return url;
  }
}
