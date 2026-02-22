# Valeur métier

## 🎯 Problème métier ciblé
Réduire le temps de traitement des demandes internes (Q&A technique, vérification de réponses, exécution d’actions standardisées).

## ⏱ Temps économisé (estimation)
- Base: 20 à 30 min par demande (collecte contexte + formulation).
- Avec Coder Brain: 8 à 12 min.
- **Gain estimé:** 12 à 18 min / demande (~40–60%).

## 💰 Coût évité/réduit (estimation)
Hypothèse: 200 demandes/mois, coût moyen chargé 50 €/h.
- Gain moyen: 15 min/demande = 50 h/mois.
- **Économie potentielle:** ~2 500 €/mois (~30 000 €/an).

## 🛡 Risque diminué
- Réponses non conformes ou incohérentes réduites par les couches de validation/safety.
- Diminution du risque d’exécution hasardeuse via `DryRunValidator` et `RiskChecker`.

## 🚀 Capacité nouvelle créée
- Orchestration unifiée de plusieurs modes d’assistance (chat, RAG, action, hybride).
- Base pour industrialiser un copilote interne gouverné et mesurable.

## KPIs proposés
- Taux de résolution au premier passage (%).
- Temps moyen de traitement (min/demande).
- Taux d’erreur/rollback (%).
- Score de qualité de réponse moyen.
- Taux d’adoption hebdomadaire (utilisateurs actifs).

## Hypothèses explicites
- Volume de demandes stable (200/mois).
- Cas d’usage majoritairement couverts par les outils existants.
- Les utilisateurs suivent un workflow standardisé.

## Conditions de validité
- Instrumentation de métriques activée (observability logs exploitables).
- Échantillon de mesure minimal: 4 semaines.
- Comparaison avant/après sur même périmètre métier.
