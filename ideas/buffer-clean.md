```mermaid
flowchart TD
  %% --- INITIALIZATION ---
  User([User Input]) --> NORM[Normalize]
  MEM[("Long-Term Memory")] -.->|Inject History/Prefs| CONTEXT
  NORM --> CONTEXT[Context Builder]
  CONTEXT --> ROUTER{Router}

  %% --- KNOWLEDGE (RAG) ---
  subgraph RAG [Knowledge Engine]
    ROUTER -->|Need Info| Q_PLAN[Query Rewrite & Plan]
    Q_PLAN --> RET[Retrieval]
    VEC_DB[("Vector Store")] <--> RET
    RET --> RERANK[Re-rank]
    RERANK --> FACT[Fact Guard\n(citations or no-answer)]
    FACT --> GEN_TXT[Generate Answer]
  end

  %% --- ACTIONS (SAFE) ---
  subgraph ACTIONS [Action Engine]
    ROUTER -->|Need Action| A_PLAN[Action Plan + Spec]
    A_PLAN --> POL{Policy & Scope}
    POL -->|Ok| SIM[Dry Run]
    SIM --> OBS[Expected Diff & Invariants]
    OBS --> RISK{High Risk?}
    RISK -->|Yes| HUM[Human Approval]
    RISK & HUM -->|Go| EXEC[Execute Tool]
    EXEC --> VERIFY[Verify vs Spec]
    VERIFY -->|Fail| ROLLBACK[Auto-Rollback]
  end

  %% --- DIRECT ---
  ROUTER -->|Chat/Logic| DIRECT[Direct Answer]

  %% --- CONSOLIDATION ---
  GEN_TXT & VERIFY & DIRECT --> AGG[Aggregation]

  %% --- CRITIC SPLIT ---
  AGG --> F_VERIF[Fact Verifier]
  F_VERIF --> T_VERIF[Tool/Outcome Verifier]
  T_VERIF --> P_VERIF[Policy/Safety Verifier]
  P_VERIF --> DECIDE{Pass?}

  %% --- CORRECTION ---
  DECIDE -->|No| CORRECT[Self-Correction]
  CORRECT -->|Refine Query| Q_PLAN
  CORRECT -->|Refine Plan| A_PLAN

  %% --- OUTPUT ---
  DECIDE -->|Yes| CONF[Confidence Gate]
  CONF --> OUT([Final Response])

  %% --- MEMORY GOVERNANCE ---
  OUT --> FEEDBACK{Feedback}
  FEEDBACK --> MEM_GOV[Memory Write Policy\nschema + TTL + dedup]
  MEM_GOV --> MEM
```

