# Buffer System

POC Node.js d’orchestration IA en 4 phases (contexte, exécution, agrégation, sortie) avec mode offline par défaut (aucune clé API requise pour un run de base).

## Démarrage en < 10 min

### Prérequis
- Node.js >= 20
- npm >= 10

### Installation
```bash
npm install
```

> Option déterministe recommandée quand `package-lock.json` est présent: `npm ci`.

### Lancement en une commande
```bash
make run
```

Alternative sans Make:
```bash
npm run run
```

## Exemple reproductible (entrée/sortie)
Commande:
```bash
npm run run
```

Entrée utilisée par le script:
- `What is 42 + 58?`

Exemple de sortie (abrégée):
```text
🚀 Buffer-System Quick Start
💬 User Input: What is 42 + 58?
💬 System Response: { ... metadata: { phase: "chat" ... } }
✅ Setup complete! Your Buffer-System is ready.
```

## Structure
- `src/phase1`: normalisation + routage d’intention
- `src/phase2`: moteurs RAG / action / hybrid / chat safety
- `src/phase3`: agrégation et scoring qualité
- `src/phase4`: finalisation et mémoire

## Documentation projet
- Vue d’ensemble: `docs/overview.md`
- Architecture: `docs/architecture.md`
- Cas d’usage: `USE_CASE.md`
- Valeur métier: `VALUE.md`
- Statut innovation: `INNOVATION_STATUS.md`
