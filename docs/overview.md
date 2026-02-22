# Overview technique

## Objectif
Ce repository implémente un orchestrateur IA multi-phase conçu pour transformer une requête utilisateur en réponse exploitable, en combinant routage d’intention, outils, sécurité et agrégation qualité.

## Composants clés
1. **Phase 1 – Context & Intent**
   - Normalise l’entrée utilisateur
   - Récupère du contexte mémoire
   - Classe l’intention (`query`, `action`, `hybrid`, `chat`)
2. **Phase 2 – Execution**
   - Exécute pipeline RAG, actions outillées ou réponse conversationnelle
   - Ajoute des vérifications de sécurité et de risque
3. **Phase 3 – Aggregation**
   - Consolide les résultats partiels
   - Calcule un score qualité
4. **Phase 4 – Output & Learning**
   - Raffine la réponse
   - Ajoute métadonnées et journalisation
   - Décide la persistance en mémoire

## Exécution
- Entrée principale: `npm run run` (fichier `src/index.js`)
- API HTTP: `npm start` (fichier `src/server.js`)

## Dépendances explicites
- Runtime: Node.js 20+
- Package manager: npm
- Dépendances NPM listées dans `package.json` (pas de dépendance cachée)
- Clé OpenAI facultative: sans clé, mode offline simulé
