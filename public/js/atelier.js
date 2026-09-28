// L'atelier : dépôt d'images → objets 3D à l'échelle → boîtes → meuble → fichiers et devis.
// Chaîne par objet : relief local immédiat → taille (Gemini) → aperçu 3D (fal TRELLIS) → option impression (fal Hunyuan).
import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { chargerImage, masquer, gonfler } from './silhouette.js';
import { chargerModele } from './modeles3d.js';
import { hauteurImprimee, boite, agencer, estimerPrix, fmt } from './meuble.js';
import { panneauxBoite, imbriquer, svgPlateau } from './laser.js';
import { creerVitrine } from './vitrine.js';

const $ = (s) => document.querySelector(s);
const EPAISSEUR_CM = 0.3; // contreplaqué 3 mm

const etat = {
  objets: [],
  echelle: 0.2,
  largeurMax: 60,
  jeu: 0.8,
  kerf: 0.1,
  plateau: [600, 400],
  calcul: null, // dernier agencement calculé
  config: { estimate: null, generate: null, prix: {} },
};

const vitrine = creerVitrine($('#scene'));
const materiau = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .55, metalness: .05 });
const materiauBlanc = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: .6 });

// Chemins relatifs : le site fonctionne aussi dans un sous-dossier (GitHub Pages)
const surPages = location.hostname.endsWith('github.io'); // pas de serveur : inutile de le chercher
const configPrete = (surPages ? Promise.reject() : fetch('api/config')).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(c => {
  etat.config = c;
  const m = [];
  m.push(c.estimate ? 'Taille : Gemini' : 'Taille : d\'après le nom (pas de clé Gemini)');
  m.push(c.generate ? 'Relief 3D : fal.ai' : 'Relief 3D : local (pas de clé fal.ai)');
  $('#moteurs').textContent = m.join(' · ');
}).catch(() => {
  etat.statique = true;
  $('#moteurs').textContent = 'Version en ligne : relief calculé dans votre navigateur. L\'IA (Gemini, fal.ai) demande le serveur du projet.';
});

// ─── Tailles typiques : repli quand aucune IA n'est branchée ───
const TAILLES = [
  [/puce|flea|fourmi|ant\b|acarien/i, .3], [/insecte|insect|scarab|beetle|coccinelle/i, 3],
  [/papillon|butterfly|moth/i, 8], [/coquill|shell|nautil/i, 20], [/crâne|crane|skull/i, 18],
  [/astrolabe/i, 20], [/sph[eè]re|globe/i, 40], [/microscope/i, 35], [/canope|canopic|jarre|jar|vase|amphore/i, 30],
  [/fossile|fossil|trilobite|ammonite/i, 10], [/min[ée]ral|crystal|cristal|géode|geode/i, 8],
  [/montre|watch|pi[eè]ce|coin/i, 4], [/fusée|rocket|navette|shuttle/i, 11000], [/satellite/i, 300],
  [/oiseau|bird/i, 25], [/poisson|fish/i, 30], [/masque|mask/i, 25], [/statue|statuette|figur/i, 30],
  [/livre|book|manuscrit/i, 25], [/clé|clef|key/i, 8], [/robot/i, 40], [/dent|tooth/i, 5], [/œuf|oeuf|egg/i, 6],
];
function tailleParNom(nom) {
  for (const [re, h] of TAILLES) if (re.test(nom)) return { h, source: 'mots' };
  return { h: 15, source: 'defaut' };
}

async function estimerTaille(objet) {
  await configPrete;
  if (etat.config.estimate && objet.miniature) {
    try {
      const r = await fetch('api/estimate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: objet.nom, image: objet.miniature }),
      }).then(r => r.json());
      if (r.hauteur_cm > 0) return { h: r.hauteur_cm, source: 'ia', indice: `${r.objet} — ${r.indice}`, confiance: r.confiance };
    } catch { /* repli */ }
  }
  return tailleParNom(objet.nom);
}

// ─── Ajout d'objets ───
let compteur = 0;
function nouvelObjet(nom, extra = {}) {
  const objet = { id: ++compteur, nom, hauteurReelle: 15, source: '…', etat: 'préparation…', ...extra };
  etat.objets.push(objet);
  rendreListe();
  return objet;
}

async function ajouter(src, nom, hauteurConnue) {
  const objet = nouvelObjet(nom, { src, hauteurReelle: hauteurConnue || 15, source: hauteurConnue ? 'base' : '…' });
  try {
    const img = await chargerImage(src);
    objet.miniature = redimensionner(img, 384);
    objet.imageGen = redimensionner(img, 1024);
    await new Promise(r => setTimeout(r, 20)); // laisse l'interface respirer
    const forme = gonfler(masquer(img));
    appliquerForme(objet, { geometrie: forme.geometrie, taille: forme.taille, affichage: null }, 'relief local');
    recalculer();
    if (!hauteurConnue) {
      const t = await estimerTaille(objet);
      objet.hauteurReelle = t.h; objet.source = t.source; objet.indice = t.indice;
    }
    recalculer();
    await configPrete;
    if (etat.config.generate) generer(objet, 'apercu');
  } catch (e) {
    console.error(e);
    objet.etat = 'image illisible';
    recalculer();
  }
}

/** Ajout direct d'un modèle 3D existant (Smithsonian) : pas de génération. */
async function ajouterModele(url, nom) {
  const objet = nouvelObjet(nom, { src: null, source: '…' });
  try {
    const m = await chargerModele(url);
    appliquerForme(objet, m, 'modèle 3D de la collection');
    // Les modèles Smithsonian sont en mètres : on s'en sert si la valeur est plausible
    const h = m.tailleFichier.y * 100;
    if (h > .05 && h < 5000) { objet.hauteurReelle = +h.toPrecision(3); objet.source = 'fichier'; }
    else { const t = tailleParNom(nom); objet.hauteurReelle = t.h; objet.source = t.source; }
    objet.miniature = vitrine.vignette(m.affichage);
  } catch (e) {
    console.error(e);
    objet.etat = 'modèle illisible';
  }
  recalculer();
}

function appliquerForme(objet, forme, etiquette) {
  objet.geometrie = forme.geometrie;
  objet.affichage = forme.affichage;
  objet.tailleNorm = forme.taille;
  objet.volumeNorm = volume(forme.geometrie);
  objet.bordsOuverts = forme.bordsOuverts || 0;
  objet.etat = etiquette;
}

// ─── Génération 3D via le serveur (fal.ai) ───
async function generer(objet, qualite) {
  objet.generation = { qualite, etat: 'envoi…' };
  rendreListe();
  try {
    const r = await fetch('api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: objet.imageGen, qualite }),
    });
    const j = await r.json();
    if (!r.ok || !j.id) throw new Error(j.error || 'moteur indisponible');
    for (;;) {
      await new Promise(res => setTimeout(res, 3000));
      const s = await fetch('api/generate?id=' + encodeURIComponent(j.id)).then(r => r.json());
      if (s.error) throw new Error(s.error);
      if (s.etat === 'erreur') throw new Error(s.message);
      if (s.etat === 'fini') {
        const m = await chargerModele(s.url);
        appliquerForme(objet, m, qualite === 'impression' ? 'maillage impression (Hunyuan3D)' : 'aperçu 3D (TRELLIS)');
        objet.qualite = qualite;
        objet.generation = null;
        recalculer();
        return;
      }
      objet.generation.etat = s.etat === 'file' ? `en file${s.position != null ? ' (' + s.position + ')' : ''}…` : 'modélisation…';
      rendreListe();
    }
  } catch (e) {
    console.error(e);
    objet.generation = { qualite, etat: 'échec : ' + e.message, echec: true };
    rendreListe();
  }
}

function redimensionner(img, cote) {
  const k = Math.min(1, cote / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  const cx = c.getContext('2d');
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); // les PNG transparents restent lisibles en JPEG
  cx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', .88);
}

function volume(g) {
  const p = g.attributes.position.array;
  const idx = g.index ? g.index.array : null;
  const n = idx ? idx.length : p.length / 3;
  let v = 0;
  for (let i = 0; i < n; i += 3) {
    const a = (idx ? idx[i] : i) * 3, b = (idx ? idx[i + 1] : i + 1) * 3, c = (idx ? idx[i + 2] : i + 2) * 3;
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
       - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
       + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return Math.abs(v / 6);
}

function lireFichiers(fichiers) {
  for (const f of fichiers) {
    if (!f.type.startsWith('image/')) continue;
    const lecteur = new FileReader();
    lecteur.onload = () => ajouter(lecteur.result, f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
    lecteur.readAsDataURL(f);
  }
}

const depot = $('#depot');
$('#fichiers').addEventListener('change', (e) => { lireFichiers(e.target.files); e.target.value = ''; });
['dragenter', 'dragover'].forEach(t => depot.addEventListener(t, (e) => { e.preventDefault(); depot.classList.add('survol'); }));
['dragleave', 'drop'].forEach(t => depot.addEventListener(t, () => depot.classList.remove('survol')));
depot.addEventListener('drop', (e) => { e.preventDefault(); lireFichiers(e.dataTransfer.files); });
// On accepte aussi un dépôt n'importe où dans l'atelier
$('#atelier').addEventListener('dragover', (e) => e.preventDefault());
$('#atelier').addEventListener('drop', (e) => { if (!depot.contains(e.target)) { e.preventDefault(); lireFichiers(e.dataTransfer.files); } });

$('#exemples').addEventListener('click', () => {
  // Objets du Met Museum (CC0), avec leurs dimensions réelles publiées
  ajouter('img/exemples/astrolabe.jpg', 'Astrolabe planisphérique', 21.6);
  ajouter('img/exemples/nautile.jpg', 'Coupe en nautile', 27.9);
  ajouter('img/exemples/canope.jpg', 'Vase canope', 28);
  ajouter('img/exemples/microscope.jpg', 'Microscope', 61.6);
  ajouter('img/exemples/puce.jpg', 'Puce de Hooke', .25);
});

// ─── Puiser dans les collections ───
$('#recherche').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#q').value.trim();
  if (!q) return;
  const zone = $('#trouvailles'), info = $('#recherche-etat');
  zone.replaceChildren(); info.textContent = 'Recherche dans les collections…';
  try {
    const r = await chercherCollections(q);
    if (r.error) throw new Error(r.error);
    info.textContent = `${r.resultats.length} trouvaille${r.resultats.length > 1 ? 's' : ''}${r.traduit ? ` · recherché : « ${r.traduit} »` : ''}`;
    for (const t of r.resultats) zone.appendChild(carteTrouvaille(t));
  } catch (err) {
    info.textContent = 'Recherche impossible : ' + err.message;
  }
});

// Avec le serveur : proxy local + traduction Gemini. Sans serveur (GitHub Pages) : directement
// depuis le navigateur, les images passant par wsrv.nl pour autoriser le détourage (CORS).
async function chercherCollections(q) {
  await configPrete;
  if (!etat.statique) {
    const r = await fetch('api/collections?q=' + encodeURIComponent(q)).catch(() => null);
    if (r?.ok) return r.json();
  }
  const { chercher } = await import('./sources.js');
  const obtenir = (url) => fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  return chercher(q, { obtenir, px: (u) => 'https://wsrv.nl/?url=' + encodeURIComponent(u.replace(/^https:\/\//, '')) });
}

function carteTrouvaille(t) {
  const li = document.createElement('li');
  li.className = 'trouvaille';
  const b = document.createElement('button');
  b.type = 'button';
  b.title = `Ajouter « ${t.titre} » au cabinet`;
  if (t.image) {
    const img = document.createElement('img'); img.src = t.image; img.alt = ''; img.loading = 'lazy'; b.appendChild(img);
    img.addEventListener('error', () => li.remove()); // image absente à la source
  } else {
    const s = document.createElement('span'); s.className = 'trouvaille__3d'; s.textContent = '3D'; b.appendChild(s);
  }
  const titre = document.createElement('strong'); titre.textContent = t.titre;
  const meta = document.createElement('small');
  meta.textContent = [t.source, t.hauteur_cm ? `h ${fmt(t.hauteur_cm)} cm` : null, t.glb ? 'modèle 3D' : null].filter(Boolean).join(' · ');
  b.append(titre, meta);
  b.addEventListener('click', () => {
    b.disabled = true; li.classList.add('ajoutee');
    if (t.glb) ajouterModele(t.glb, t.titre);
    else ajouter(t.image, t.titre, t.hauteur_cm || undefined);
    $('#objets').lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  li.appendChild(b);
  return li;
}

// ─── Calcul de l'échelle, des boîtes et du meuble ───
function recalculer() {
  const prets = etat.objets.filter(o => o.geometrie);
  const placees = prets.map(o => {
    const { h, horsEchelle } = hauteurImprimee(o.hauteurReelle, etat.echelle, o.tailleNorm);
    const k = h / o.tailleNorm.y;
    o.k = k; o.horsEchelle = horsEchelle;
    o.taille = { x: o.tailleNorm.x * k, y: h, z: o.tailleNorm.z * k };
    o.volume = o.volumeNorm * k ** 3;
    o.boite = boite(o.taille, etat.jeu, EPAISSEUR_CM);
    let m;
    if (o.affichage) m = o.affichage.clone();
    else { m = new THREE.Mesh(o.geometrie, o.geometrie.attributes.color ? materiau : materiauBlanc); m.castShadow = m.receiveShadow = true; }
    return { o, maillage: m, k };
  });
  const agencement = agencer(placees.map(p => p.o.boite), etat.largeurMax);
  vitrine.afficher(placees.map((p, i) => ({ id: p.o.id, maillage: p.maillage, k: p.k, boite: p.o.boite, position: agencement.positions[i] })), agencement, EPAISSEUR_CM);
  vitrine.cadrer();
  etat.calcul = { prets, agencement };

  $('#vide').hidden = prets.length > 0;
  $('#dimensions').textContent = prets.length
    ? `Meuble ${fmt(agencement.largeur + 2 * EPAISSEUR_CM)} × ${fmt(agencement.hauteur + 2 * EPAISSEUR_CM)} × ${fmt(agencement.profondeur + EPAISSEUR_CM)} cm · ${prets.length} boîte${prets.length > 1 ? 's' : ''}`
    : '—';
  rendreListe(); rendreFichiers(); rendreRecap();
}

// ─── Liste des objets ───
const PROVENANCE = {
  ia: 'taille estimée par l\'IA', mots: 'taille estimée d\'après le nom', defaut: 'taille par défaut, à corriger',
  utilisateur: 'taille réglée à la main', base: 'taille donnée par la collection', fichier: 'taille lue dans le modèle 3D', '…': 'estimation…',
};

function rendreListe() {
  const ol = $('#objets');
  // On ne reconstruit pas une carte en cours d'édition (curseur, champ nom)
  const actif = document.activeElement;
  const enEdition = actif && ol.contains(actif) ? actif.closest('.objet')?.dataset.id : null;
  const echelleTxt = etat.echelle === .2 ? '1/5' : '1/2';

  for (const o of etat.objets) {
    let li = ol.querySelector(`[data-id="${o.id}"]`);
    if (!li) {
      li = document.createElement('li');
      li.className = 'objet'; li.dataset.id = o.id;
      li.innerHTML = `
        <img class="objet__vignette" alt="">
        <div>
          <input class="objet__nom" aria-label="Nom de l'objet">
          <div class="objet__meta"></div>
          <label class="objet__taille"><span>Taille réelle</span>
            <input type="range" min="-1" max="4" step="0.01" aria-label="Taille réelle (échelle logarithmique)">
            <output></output></label>
          <div class="objet__actions">
            <button class="lien" data-action="impression" type="button" hidden></button>
            <button class="lien" data-action="retirer" type="button">Retirer</button>
          </div>
        </div>`;
      const nom = li.querySelector('.objet__nom');
      nom.value = o.nom;
      nom.addEventListener('change', async () => {
        o.nom = nom.value.trim() || o.nom;
        // Nouveau nom : nouvelle estimation, sauf si la taille vient de l'utilisateur ou de la collection
        if (!['utilisateur', 'base', 'fichier'].includes(o.source)) {
          const t = await estimerTaille(o); o.hauteurReelle = t.h; o.source = t.source; o.indice = t.indice;
        }
        recalculer();
      });
      const curseur = li.querySelector('input[type="range"]');
      curseur.addEventListener('input', () => {
        o.hauteurReelle = +(10 ** +curseur.value).toPrecision(2);
        o.source = 'utilisateur';
        li.querySelector('output').textContent = cm(o.hauteurReelle);
      });
      curseur.addEventListener('change', recalculer);
      li.querySelector('[data-action="impression"]').addEventListener('click', () => generer(o, 'impression'));
      li.querySelector('[data-action="retirer"]').addEventListener('click', () => {
        etat.objets = etat.objets.filter(x => x !== o); li.remove(); recalculer();
      });
      ol.appendChild(li);
    }
    const vignette = li.querySelector('.objet__vignette');
    const src = o.src || o.miniature;
    if (src && vignette.getAttribute('src') !== src) vignette.src = src;
    if (String(o.id) === enEdition && document.activeElement?.type !== 'range') continue;

    const imprime = o.taille ? `imprimé ${cm(o.taille.y)} à ${echelleTxt}` : o.etat;
    const alerte = o.horsEchelle ? ` · <span class="alerte">${esc(o.horsEchelle)}</span>` : '';
    const gen = o.generation ? `<br><span class="${o.generation.echec ? 'alerte' : 'encours'}">${o.generation.qualite === 'impression' ? 'Impression' : 'Aperçu 3D'} : ${esc(o.generation.etat)}</span>` : '';
    li.querySelector('.objet__meta').innerHTML =
      `${imprime}${alerte}<br><span class="${o.source === 'defaut' ? 'alerte' : 'ok'}" title="${esc(o.indice || '')}">${PROVENANCE[o.source]}</span>` +
      `<br><span>${esc(o.taille ? o.etat : '')}</span>` +
      (o.bordsOuverts ? `<br><span class="alerte" title="${o.bordsOuverts} arêtes ouvertes">maillage ouvert : à réparer avant impression</span>` : '') + gen;
    li.querySelector('input[type="range"]').value = Math.log10(o.hauteurReelle);
    li.querySelector('output').textContent = cm(o.hauteurReelle);

    const bImp = li.querySelector('[data-action="impression"]');
    const prix = etat.config.prix?.impression;
    bImp.hidden = !etat.config.generate || !o.imageGen || o.qualite === 'impression' || !!o.generation;
    bImp.textContent = `Maillage impression${prix ? ` · ${prix.toLocaleString('fr-FR')} $` : ''}`;
  }
}
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cm = (v) => v >= 100 ? `${fmt(v / 100, 2)} m` : v < 1 ? `${fmt(v * 10)} mm` : `${fmt(v)} cm`;

// ─── Fichiers : STL et SVG ───
function telecharger(nom, contenu, type) {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nom });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

function stl(o) {
  // mm, Z vers le haut (convention des trancheurs)
  const g = o.geometrie.clone();
  g.scale(o.k * 10, o.k * 10, o.k * 10);
  g.rotateX(Math.PI / 2);
  g.computeBoundingBox(); g.translate(0, 0, -g.boundingBox.min.z);
  return new STLExporter().parse(new THREE.Mesh(g), { binary: true });
}

function plateaux() {
  const { prets, agencement } = etat.calcul;
  const t = EPAISSEUR_CM * 10;
  const echelleTxt = etat.echelle === .2 ? '1/5' : '1/2';
  const pieces = prets.flatMap((o, i) => panneauxBoite(
    { W: o.boite.ext.x * 10, H: o.boite.ext.y * 10, D: o.boite.ext.z * 10 }, t,
    `B${i + 1}`, `${o.nom} · ${echelleTxt}${o.horsEchelle ? ' (' + o.horsEchelle + ')' : ''}`));
  pieces.push(...panneauxBoite({
    W: (agencement.largeur + 2 * EPAISSEUR_CM) * 10,
    H: (agencement.hauteur + 2 * EPAISSEUR_CM) * 10,
    D: (agencement.profondeur + EPAISSEUR_CM) * 10,
  }, t, 'M', 'Cabinet de curiosités'));
  return imbriquer(pieces, etat.plateau, etat.kerf);
}

function rendreFichiers() {
  const { prets } = etat.calcul;
  const zoneStl = $('#stl'), zoneSvg = $('#svg');
  zoneStl.replaceChildren(); zoneSvg.replaceChildren();
  if (!prets.length) {
    zoneStl.innerHTML = zoneSvg.innerHTML = '<p class="vide">Ajoutez d\'abord des objets dans l\'atelier.</p>';
    return;
  }
  const bouton = (zone, gauche, droite, action) => {
    const b = document.createElement('button'); b.type = 'button';
    const s1 = document.createElement('span'); s1.textContent = gauche;
    const s2 = document.createElement('span'); s2.textContent = droite;
    b.append(s1, s2); b.addEventListener('click', action); zone.appendChild(b);
  };
  prets.forEach((o, i) => bouton(zoneStl, `B${i + 1} · ${o.nom}`, `${fmt(o.taille.x * 10, 0)}×${fmt(o.taille.y * 10, 0)}×${fmt(o.taille.z * 10, 0)} mm${o.bordsOuverts ? ' · à réparer' : ''}`,
    () => telecharger(`${String(i + 1).padStart(2, '0')}-${slug(o.nom)}.stl`, stl(o), 'model/stl')));

  const ps = plateaux();
  ps.forEach((s, i) => bouton(zoneSvg, `Plateau ${i + 1}${s.hors ? ' (grand format)' : ''}`, `${s.pieces.length} pièces · ${s.L}×${s.H} mm`,
    () => telecharger(`cabinet-plateau-${i + 1}.svg`, svgPlateau(s, etat.kerf), 'image/svg+xml')));
}

function rendreRecap() {
  const { prets, agencement } = etat.calcul;
  const dl = $('#recap');
  if (!prets.length) { dl.innerHTML = '<dt>Aucun objet</dt><dd>—</dd>'; return; }
  const meuble = { x: agencement.largeur + 2 * EPAISSEUR_CM, y: agencement.hauteur + 2 * EPAISSEUR_CM, z: agencement.profondeur + EPAISSEUR_CM };
  const p = estimerPrix(prets, prets.map(o => o.boite), meuble);
  const eur = (v) => v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  dl.innerHTML = `
    <dt>${prets.length} objets imprimés (${fmt(p.volume, 0)} cm³)</dt><dd>${eur(p.impression)}</dd>
    <dt>${prets.length + 1} boîtes découpées (${fmt(p.surface / 1e4, 2)} m²)</dt><dd>${eur(p.decoupe)}</dd>
    <dt>Assemblage</dt><dd>${eur(p.montage)}</dd>
    <dt class="total">Estimation</dt><dd class="total">${eur(p.total)}</dd>`;
  etat.calcul.prix = p;
}

// ─── Réglages ───
$('#echelle').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  $('#echelle').querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', x === b));
  etat.echelle = +b.dataset.v;
  // Un meuble à 1/2 est naturellement plus large
  const l = $('#largeur');
  if (etat.echelle === .5 && +l.value === 60) l.value = 100;
  if (etat.echelle === .2 && +l.value === 100) l.value = 60;
  etat.largeurMax = +l.value;
  recalculer(); vitrine.cadrer();
});
$('#largeur').addEventListener('change', (e) => { etat.largeurMax = Math.max(20, +e.target.value || 60); recalculer(); vitrine.cadrer(); });
$('#jeu').addEventListener('change', (e) => { etat.jeu = Math.max(.3, +e.target.value || .8); recalculer(); });
$('#kerf').addEventListener('change', (e) => { etat.kerf = Math.max(0, +e.target.value || 0); rendreFichiers(); });
$('#plateau').addEventListener('change', (e) => { etat.plateau = e.target.value.split('x').map(Number); rendreFichiers(); });
$('#lumiere').addEventListener('change', (e) => vitrine.eclairer(e.target.checked));

// ─── Devis ───
$('#devis').addEventListener('submit', async (e) => {
  e.preventDefault();
  const etatDevis = $('#devis-etat');
  const { prets, agencement, prix } = etat.calcul || {};
  if (!prets?.length) { etatDevis.textContent = 'Ajoutez au moins un objet au cabinet.'; return; }
  const f = new FormData(e.target);
  const corps = {
    nom: f.get('nom'), email: f.get('email'), message: f.get('message'),
    echelle: etat.echelle === .2 ? '1/5' : '1/2',
    meuble_cm: { largeur: agencement.largeur + 2 * EPAISSEUR_CM, hauteur: agencement.hauteur + 2 * EPAISSEUR_CM, profondeur: agencement.profondeur + EPAISSEUR_CM },
    objets: prets.map((o, i) => ({ code: `B${i + 1}`, nom: o.nom, hauteur_reelle_cm: o.hauteurReelle, source_taille: o.source, modele: o.etat, imprime_cm: o.taille, hors_echelle: o.horsEchelle, boite_int_cm: o.boite.int, miniature: o.miniature })),
    estimation_eur: Math.round(prix.total),
    apercu: vitrine.capture(),
  };
  const b = e.target.querySelector('button'); b.disabled = true;
  await configPrete;
  if (etat.statique) {
    // Pas de serveur (version en ligne) : la demande complète est téléchargée, à joindre à un e-mail
    telecharger(`demande-devis-cabinet-${slug(corps.nom || 'curiosites')}.json`, JSON.stringify(corps, null, 2), 'application/json');
    etatDevis.textContent = 'Votre demande (objets, cotes, aperçu) a été téléchargée : joignez-la à votre e-mail de commande.';
    b.disabled = false;
    return;
  }
  etatDevis.textContent = 'Envoi…';
  try {
    const r = await fetch('api/devis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    etatDevis.textContent = `Demande reçue (n° ${j.id.slice(-4)}). Réponse sous 48 h.`;
    e.target.reset();
  } catch (err) {
    etatDevis.textContent = 'Échec de l\'envoi : ' + err.message;
  } finally { b.disabled = false; }
});

recalculer();
