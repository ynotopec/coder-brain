# Architecture

```mermaid
flowchart TD
    A[User Input] --> B[Phase 1: ContextBuilder + IntentRouter]
    B --> C{Intent}

    C -->|query| D[Phase 2: RAG Engine]
    C -->|action| E[Phase 2: Action Engine]
    C -->|hybrid| F[Phase 2: Hybrid Orchestrator]
    C -->|chat| G[Phase 2: Chat + Safety]

    D --> H[Phase 3: ResponseAggregator]
    E --> H
    F --> H
    G --> H

    H --> I[Phase 4: Refinement + OutputWriter]
    I --> J[Final Response + Metadata]
    I --> K[(Long-term Memory)]
```

## Notes de conception
- Le système applique une boucle de retry contrôlée (`RetryGatekeeper`) en cas d’échec.
- La sécurité est évaluée avant la génération chat et tracée dans `ObservabilityLog`.
- Le mode offline est opt-in uniquement (`OPENAI_OFFLINE=true`) ; sinon les erreurs API/réseau sont remontées.
- La configuration runtime est explicite via `.env.example` (mode online avec clé API ou mode offline forcé).
