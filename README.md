# Cabinet de curiosités

Glissez des images : elles deviennent des objets 3D imprimables, mis à la même échelle (1/5 ou 1/2), rangés dans des boîtes sur mesure à découper au laser.

**En ligne :** https://augustinmarso.github.io/cabinet-curiosite/ (version sans serveur : salle 3D, laboratoire, atelier avec relief calculé dans le navigateur, recherche dans les collections, STL, SVG laser ; la demande de devis est téléchargée en JSON). Pour l'IA (Gemini, fal.ai) et l'envoi des devis, lancez le serveur.

## Lancer

```
npm start          # http://localhost:5280
```

Aucune dépendance à installer (Node ≥ 22.15). Sans clé, tout fonctionne en mode local : relief calculé dans le navigateur, taille devinée d'après le nom.

## Brancher les moteurs IA

Copiez `.env.example` en `.env` et remplissez :

| Clé | Rôle | Coût |
|---|---|---|
| `GEMINI_API_KEY` ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)) | Taille réelle de l'objet (Gemini 2.5 Flash-Lite) + traduction des recherches en anglais | Offre gratuite (Google peut alors utiliser les données) |
| `FAL_KEY` ([fal.ai/dashboard/keys](https://fal.ai/dashboard/keys)) | Image → 3D : aperçu TRELLIS automatique, maillage impression Hunyuan3D v2 à la demande | ≈ 0,02 $ / aperçu, ≈ 0,16 $ / impression |

Chaque génération est journalisée dans `generations.jsonl` (suivi des dépenses). Les modèles générés sont copiés dans `modeles/`.

## Parcours

1. **Salle obscure** (scène 3D) : un meuble à niches avec 10 modèles Smithsonian Open Access (CC0, dans `public/modeles-salle/`) plongés dans le noir ; la lampe suit le pointeur et un objet longtemps éclairé reste révélé, avec son cartel. Deux niches vides renvoient vers l'atelier.
   **Le laboratoire** (bento) : nébuleuse faite du vrai code source du site, exemples d'échelle calculés par `meuble.js`, entures tracées par `laser.js`, titres « scramble » (portés en JS depuis le registre shadcn @fancy).
2. **Atelier** : dépôt d'images ou recherche dans les collections (Met, Art Institute of Chicago, Cleveland : images CC0 avec dimensions ; Smithsonian 3D : modèles GLB CC0 sans coût de génération).
   - Échelle commune 1/5 ou 1/2 ; les objets trop petits sont agrandis, les trop grands réduits, et c'est signalé.
   - Chaque boîte est taillée pour son objet (jeu réglable), les boîtes sont rangées par étagères dans le meuble.
   - Le meuble choisit seul sa largeur (proportions d'un cabinet ≈ 1,15 × plus haut que large, le moins de vide possible, sans dépasser la largeur max.) ; chaque changement est animé.
3. **Fabriquer** : STL par objet (mm), plateaux SVG laser (contreplaqué 3 mm, entures, kerf réglable ; rouge = découpe, bleu = gravure), demande de devis enregistrée dans `devis/`.

## Fichiers

- `server.js` : serveur statique + API (`/api/estimate`, `/api/generate`, `/api/collections`, `/api/proxy`, `/api/devis`)
- `lib/ia.js` : Gemini et fal.ai · `lib/collections.js` : musées + proxy autorisé
- `public/js/` : `lanterne.js` (salle), `atelier.js` (chaîne complète), `silhouette.js` (relief local), `modeles3d.js` (GLB), `meuble.js` (échelle, boîtes, prix), `laser.js` (entures, imbrication), `vitrine.js` (Three.js)

## Limites connues

- Le relief local détoure mal les objets dont la couleur est proche du fond (ex. vase canope) ; le moteur fal.ai corrige cela.
- Les scans de musée ne sont pas toujours fermés : ils sont marqués « à réparer » (réparation automatique du trancheur).
- Les tarifs du devis (`TARIFS` dans `meuble.js`) sont indicatifs.
