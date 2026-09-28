// Chargement de modèles GLB (fal.ai, Smithsonian) et normalisation :
// hauteur 1, posé sur y = 0, centré en X/Z — comme le relief local de silhouette.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
const chargeur = new GLTFLoader().setDRACOLoader(draco);

/**
 * Retourne { affichage, geometrie, taille, tailleFichier } :
 * - affichage : Object3D normalisé (matériaux d'origine) pour la vitrine ;
 * - geometrie : maillage fusionné normalisé (positions seules) pour le STL et le volume ;
 * - tailleFichier : dimensions brutes du fichier (unités du fichier, souvent des mètres).
 */
export async function chargerModele(url) {
  const gltf = await chargeur.loadAsync(url);
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  const morceaux = [];
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes.position) return;
    o.castShadow = o.receiveShadow = true;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', o.geometry.attributes.position.clone());
    if (o.geometry.index) g.setIndex(o.geometry.index.clone());
    g.applyMatrix4(o.matrixWorld);
    morceaux.push(g);
  });
  if (!morceaux.length) throw new Error('modèle vide');
  // Tous indexés ou tous non indexés pour la fusion
  const homogenes = morceaux.every(g => g.index) ? morceaux : morceaux.map(g => g.index ? g.toNonIndexed() : g);
  const geometrie = mergeGeometries(homogenes, false);

  geometrie.computeBoundingBox();
  const bb = geometrie.boundingBox, t = new THREE.Vector3();
  bb.getSize(t);
  const tailleFichier = { x: t.x, y: t.y, z: t.z };
  const s = 1 / t.y;
  const decal = new THREE.Vector3(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);

  geometrie.translate(decal.x, decal.y, decal.z);
  geometrie.scale(s, s, s);
  geometrie.computeVertexNormals();

  const interieur = new THREE.Group();
  interieur.add(scene);
  scene.position.add(decal);
  const affichage = new THREE.Group();
  affichage.add(interieur);
  interieur.scale.setScalar(s);

  return { affichage, geometrie, taille: { x: t.x * s, y: 1, z: t.z * s }, tailleFichier, bordsOuverts: bordsOuverts(geometrie) };
}

/** Nombre d'arêtes n'appartenant qu'à un triangle (0 = maillage fermé, imprimable tel quel). */
export function bordsOuverts(g) {
  const p = g.attributes.position.array, idx = g.index?.array;
  const n = idx ? idx.length : p.length / 3;
  // Sommets fusionnés par position (les fichiers dupliquent souvent les sommets aux coutures)
  const cle = new Map(), id = (i) => {
    const k = `${p[i * 3].toFixed(5)},${p[i * 3 + 1].toFixed(5)},${p[i * 3 + 2].toFixed(5)}`;
    let v = cle.get(k); if (v === undefined) { v = cle.size; cle.set(k, v); } return v;
  };
  const aretes = new Map();
  for (let t = 0; t < n; t += 3) {
    const v = [0, 1, 2].map(k => id(idx ? idx[t + k] : t + k));
    for (let k = 0; k < 3; k++) {
      const a = v[k], b = v[(k + 1) % 3], e = a < b ? a * 4194304 + b : b * 4194304 + a;
      aretes.set(e, (aretes.get(e) || 0) + 1);
    }
  }
  let ouverts = 0;
  for (const c of aretes.values()) if (c === 1) ouverts++;
  return ouverts;
}
