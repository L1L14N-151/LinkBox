# LinkBox (MV2)

LinkBox enregistre des liens, en ouvre un au hasard et permet de gérer/importer/exporter la liste. Données 100% locales via `browser.storage.local`.

## Permissions essentielles
- `storage` (sauvegarde locale)
- `tabs` (lire l’onglet actif et ouvrir un onglet)
- `contextMenus` (ajoute “Enregistrer cette page / ce lien”)

## Construire le paquet (ZIP)
- Exécuter: `bash scripts/build-zip.sh`
- Le fichier est généré dans `dist/linkbox-<version>.zip`

Pour soumission Firefox: utilisez le ZIP généré (aucun autre fichier nécessaire).

## Lancer en dev (Firefox)
- `npx web-ext run --source-dir .` (si `web-ext` installé)
ou
- `about:debugging` → “Charger un module complémentaire temporaire” → sélectionner le dossier.

## Fichiers inclus
- `manifest.json`, `background.js`
- `popup.*`, `manage.*`, `import.*`, `styles.css`
- `icons/`, `_locales/`

Note: pas de collecte, pas de serveur. Les liens marqués “vu” ou “ignoré” sont exclus du tirage; les favoris sont pondérés.
