# Coder Brain

POC Node.js d’orchestration IA en 4 phases (contexte, exécution, agrégation, sortie) avec mode online par défaut (clé OpenAI requise), et mode offline uniquement si activé explicitement (`OPENAI_OFFLINE=true`).

## Démarrage en < 10 min

### Prérequis
- Node.js >= 20
- npm >= 10

### Installation déterministe
```bash
make install
```

Cette commande utilise `npm ci` pour garantir une installation reproductible via `package-lock.json`.

### Configuration explicite
Copiez le fichier d’exemple puis choisissez un mode:
```bash
cp .env.example .env
```

- Mode online: renseigner `OPENAI_API_KEY`
- Mode offline: mettre `OPENAI_OFFLINE=true`

### Lancement en une commande
```bash
make run
```

Cette commande lance le serveur web sur `http://localhost:8080`.

### Interface web
```bash
npm start
```
Puis ouvrez `http://localhost:8080` pour utiliser l'interface web moderne et progressive.

## Exemple reproductible (entrée/sortie)
Commande:
```bash
make run-cli-offline
```

Entrée utilisée par le script:
- `What is 42 + 58?`

Exemple de sortie (abrégée):
```text
🚀 Brain-System Quick Start
💬 User Input: What is 42 + 58?
💬 System Response: { ... metadata: { phase: "chat" ... } }
✅ Setup complete! Your Brain-System is ready.
```


## Automatisation (repo simplifié)
- `make check` ou `npm run check`: lance lint + tests unitaires.
- `make clean` ou `npm run clean`: supprime uniquement les artefacts locaux générés (`coverage`, `.nyc_output`, logs, fichiers temporaires).
- Le test ad-hoc legacy `test.js` et l'exemple obsolète `examples/demo.js` sont désormais des placeholders minimaux pour réduire le bruit.

## Structure
- `src/phase1`: normalisation + routage d’intention
- `src/phase2`: moteurs RAG / action / hybrid / chat safety
- `src/phase3`: agrégation et scoring qualité
- `src/phase4`: finalisation et mémoire

## Documentation
- `ARCHITECTURE.md` - Architecture et implémentation
- `docs/overview.md` - Vue d'ensemble système
- `docs/architecture.md` - Diagrammes d'architecture
- `docs/state-flow.md` - State flow et séquences critiques
