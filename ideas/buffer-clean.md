Voici une version **consolidée et synthétique** de l'architecture v3. J'ai fusionné les 5 modules en un seul diagramme "Master" pour une vision globale immédiate, tout en conservant les mécanismes de sécurité et d'apprentissage.

### Architecture Unifiée : Agent Apprenant & Sécurisé (v3)

Ce diagramme capture le flux complet : du contexte initial alimenté par la mémoire, jusqu'à l'exécution sécurisée (Dry Run) et la boucle d'apprentissage finale.

```mermaid
flowchart TD
  %% --- INITIALIZATION ---
  User([User Input]) --> NORM[Normalize]
  MEM[("Long-Term Memory")] -.->|Inject History/Prefs| CONTEXT
  NORM --> CONTEXT[Context Builder]
  
  CONTEXT --> ROUTER{Router}

  %% --- BRANCH 1: KNOWLEDGE (RAG) ---
  subgraph RAG [Knowledge Engine]
    ROUTER -->|Need Info| Q_PLAN[Query Plan]
    Q_PLAN --> RET[Retrieval]
    VEC_DB[("Vector Store")] <--> RET
    RET --> RANK[Re-rank & Fact Check] --> GEN_TXT[Generate Answer]
  end

  %% --- BRANCH 2: ACTIONS (SAFE) ---
  subgraph ACTIONS [Action Engine]
    ROUTER -->|Need Action| A_PLAN[Action Plan]
    A_PLAN --> POL{Policy Check}
    POL -->|Ok| SIM[Dry Run / Simulation]
    SIM --> RISK{High Risk?}
    RISK -->|Yes| HUM[Human Approval]
    RISK & HUM -->|Go| EXEC[Execute Tool]
    EXEC --> VERIFY{Success?} -->|No| ROLLBACK[Auto-Rollback]
  end

  %% --- BRANCH 3: DIRECT ---
  ROUTER -->|Chat/Logic| DIRECT[Direct Answer]

  %% --- CONSOLIDATION & REASONING ---
  GEN_TXT & VERIFY & DIRECT --> AGG[Aggregation]
  AGG --> CRITIC{Critic / Verifier}

  %% --- LOOPS ---
  CRITIC -->|Fail: Hallucination/Error| CORRECT[Self-Correction Logic]
  CORRECT -->|Refine Query| Q_PLAN
  CORRECT -->|Refine Plan| A_PLAN

  %% --- OUTPUT & LEARNING ---
  CRITIC -->|Pass| OUT([Final Response])
  
  OUT --> FEEDBACK{Implicit/Explicit Feedback}
  FEEDBACK -->|Insight| MEM_PIPE[Memory Pipeline]
  MEM_PIPE -->|Update| MEM
```

### Points Clés de la Réduction :

1.  **Boucle Fermée (Closed Loop)** : La base de données `Long-Term Memory` est maintenant le point de départ (Contexte) et le point d'arrivée (Pipeline de mise à jour), créant un agent qui apprend de ses sessions.
2.  **Sécurité Actionnelle** : Le bloc `Actions` inclut explicitement `Dry Run` (Simulation) et `Rollback`, condensant la gestion des risques infra (K8s) en un flux visuel simple.
3.  **Auto-Correction Centralisée** : Le `Critic` central renvoie les erreurs vers les planificateurs spécifiques (RAG ou Action) plutôt que de créer des boucles disparates.
4.  **RAG Simplifié** : La distinction Ingestion/Runtime est abstraite par la double flèche `<-->` vers le `Vector Store`.
