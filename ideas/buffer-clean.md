```mermaid
flowchart TD
  %% --- STYLING ---
  classDef db fill:#e1f5fe,stroke:#01579b,stroke-width:2px;
  classDef logic fill:#fff3e0,stroke:#e65100,stroke-width:2px;
  classDef gate fill:#ffebee,stroke:#b71c1c,stroke-width:2px,shape:rhombus;
  classDef term fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px,rx:10,ry:10;
  classDef crit fill:#f3e5f5,stroke:#4a148c,stroke-width:1px,stroke-dasharray: 5 5;
  classDef obs fill:#eceff1,stroke:#37474f,stroke-width:1px,stroke-dasharray: 3 3;
  classDef safety fill:#ffebee,stroke:#c62828,stroke-width:3px;
  classDef cache fill:#e0f2f1,stroke:#00695c,stroke-width:1px;

  %% ==========================================
  %% PHASE 0: ADMISSION & PRIORITY (NEW)
  %% ==========================================
  subgraph ADMIT [Phase 0: Admission Control]
    User([User Input]):::term --> PRIO{Priority Classifier}:::gate
    PRIO -->|P0-Critical| BYPASS[Emergency Exec<br/>+ Async Audit]:::safety
    PRIO -->|P1-Standard| NORM[Normalize Input]:::logic
    PRIO -->|P2-Background| BGQ[(Background Queue)]:::db
    
    BYPASS --> FINAL
    BGQ -.->|Batch Dequeue| NORM
  end

  %% ==========================================
  %% PHASE 1: CONTEXT & ROUTING (HARDENED)
  %% ==========================================
  subgraph CTX [Phase 1: Context & Ensemble Routing]
    NORM --> BUILD[Context Builder]:::logic
    MEM_LTM[("Long-Term Memory")]:::db -.->|Retrieval| BUILD
    
    %% Router Redundancy (P0 Fix)
    BUILD --> R1[Router A: Intent]:::logic
    BUILD --> R2[Router B: Safety]:::logic  
    BUILD --> R3[Router C: Complexity]:::logic
    R1 & R2 & R3 --> ENSEMBLE{Consensus<br/>Confidence >0.8?}:::gate
    
    ENSEMBLE -->|Yes| ROUTE[High-Confidence Route]:::logic
    ENSEMBLE -->|No / Conflict| SAFE_ROUTE[Default: Action Flow<br/>+ HITL Trigger]:::safety
    
    ROUTE -->|Query| RAG_FLOW
    ROUTE -->|Task| ACT_FLOW
    ROUTE -->|Chit-Chat| CHAT_FLOW
    SAFE_ROUTE --> ACT_FLOW
    
    %% Observability Hook
    BUILD -.->|Span: ContextBuild| OBS1[Telemetry]:::obs
    ENSEMBLE -.->|Span: RouteConfidence| OBS1
  end

  %% ==========================================
  %% PHASE 2: EXECUTION ENGINES (HARDENED)
  %% ==========================================
  subgraph ENGINE [Phase 2: Execution Engines]
    direction TB
    
    %% --- RAG Flow with Cache (P2 Fix) ---
    subgraph RAG_FLOW [RAG Pipeline]
      R_PLAN[Query Planner]:::logic --> CACHE{Cache Hit?}:::cache
      CACHE -->|Yes| RERANK
      CACHE -->|No| VEC_DB[("Vector Store")]:::db
      VEC_DB --> RERANK[Re-Rank & Filter]:::logic
      RERANK --> SUFF{Data Found?}:::gate
      SUFF -->|No| FALL[Fallback Message]:::logic
      SUFF -->|Yes| GEN[Generate Answer]:::logic
    end
    
    %% --- Action Flow with Circuit Breaker (P1 Fix) ---
    subgraph ACT_FLOW [Action Pipeline]
      A_PLAN[Action Planner]:::logic --> SIM[Dry Run]:::logic
      SIM --> CB{Circuit Breaker<br/>State?}:::safety
      CB -->|OPEN| CB_FALL[Queue for Later<br/>+ Notify User]:::logic
      CB -->|CLOSED| RISK{Risk Check}:::gate
      
      RISK -->|High| HITL{Human Approval}:::gate
      RISK -->|Low| EXEC[Execute Tool]:::logic
      
      %% HITL Fix: Explicit Reject Path (P0)
      HITL -->|Approved| EXEC
      HITL -->|Rejected| FALL
      HITL -->|Timeout| FALL
      
      EXEC --> VERIFY{Verify Output}:::gate
      VERIFY -->|Fail| ROLL[Rollback]:::logic
      ROLL -->|Record Failure| CB_UPD[Update CB Metrics]:::logic
      CB_UPD --> CB
      
      %% Observability
      EXEC -.->|Span: ToolExec| OBS2[Telemetry]:::obs
    end
    
    %% --- Fast Track ---
    subgraph CHAT_FLOW [Direct Pipeline]
      CHAT[Direct Reply]:::logic
    end
  end

  %% ==========================================
  %% PHASE 3: VECTORIZED EVALUATION (P0 FIX)
  %% ==========================================
  subgraph REVIEW [Phase 3: System 2 Evaluation]
    GEN & FALL & EXEC & ROLL & CB_FALL --> AGG[Response Aggregator]:::logic
    
    %% Latency Budget Manager (P1 Fix)
    AGG --> BUDGET{Latency Budget<br/>Remaining?}:::gate
    
    BUDGET -->|>200ms| FULL_CRIT[Full Critics]:::logic
    BUDGET -->|<200ms| DEGRADE[Safety-Only Check]:::logic
    
    %% Parallel Critics (Vectorized - P0 Fix)
    FULL_CRIT --> F_C[Fact Checker]:::crit
    FULL_CRIT --> S_C[Safety/Policy]:::crit  
    FULL_CRIT --> T_C[Tool Outcome]:::crit
    
    %% Dynamic Critic Selection (P2 Fix)
    CHAT -.->|Skips F_C,T_C| S_C
    
    %% Vector Decision (Replaces Scalar Score)
    F_C & S_C & T_C --> DECISION{Conflict Matrix}:::safety
    
    DECISION -->|All Pass| PASS([Pass]):::term
    DECISION -->|Safety Fail| BLOCK([Block/Hallucinate]):::safety
    DECISION -->|Fact Fail| RETRY_PATH[Retry Trigger]:::logic
    DECISION -->|Tool Fail| ROLLBACK_PATH[Rollback Trigger]:::logic
    DECISION -->|Conflict| ESCALATE[HITL Review]:::safety
    
    DEGRADE --> S_C_ONLY{Safety Pass?}:::gate
    S_C_ONLY -->|Yes| PASS
    S_C_ONLY -->|No| BLOCK
    
    %% Observability
    DECISION -.->|Span: CriticVotes| OBS3[Telemetry]:::obs
  end

  %% ==========================================
  %% PHASE 4: SMART RETRY (P1 FIX)
  %% ==========================================
  subgraph RETRY [Phase 4: Resolution]
    PASS --> FINAL([Final Response]):::term
    BLOCK --> FINAL_ERR([Error Response]):::term
    
    RETRY_PATH & ROLLBACK_PATH --> DISCRIM[Context Discriminator]:::logic
    
    %% Context Discriminator (P1 Fix)
    DISCRIM --> RCA{Root Cause<br/>Analysis}:::logic
    RCA -->|Context Pollution| PRUNE[Prune Noise<br/>Keep Core]:::logic
    RCA -->|Insufficient Data| ENHANCE[Expand Retrieval<br/>Relax Filters]:::logic
    RCA -->|Logic Error| REASON[Inject CoT Prompt]:::logic
    
    PRUNE & ENHANCE & REASON --> RETRY_CNT{Retry Count<br/><3?}:::gate
    
    RETRY_CNT -->|Yes| INJECT[Inject Refined Context]:::logic
    RETRY_CNT -->|No| FORCE_EXIT[Generate Apology<br/>+ Escalation]:::logic
    
    INJECT -->|Replace Context| BUILD
    
    %% Observability
    RCA -.->|Span: RetryReason| OBS4[Telemetry]:::obs
  end

  %% ==========================================
  %% PHASE 5: MEMORY & FEEDBACK (P0 FIX)
  %% ==========================================
  subgraph MEM_PHASE [Phase 5: Memory Consolidation]
    FINAL & FINAL_ERR --> USER_FB[/User Signal/]:::term
    
    USER_FB --> MEM_POL{Worth Keeping?}:::gate
    
    %% Explicit Discard Path (P0 Fix)
    MEM_POL -->|Yes| SCHEMA[Schema & Embed]:::logic
    MEM_POL -->|No| DISCARD[Quarantine/<br/>Discard]:::logic
    MEM_POL -->|Toxic| TOXIC[Poison Buffer<br/>(Blocklist)]:::safety
    
    SCHEMA --> MEM_LTM
    DISCARD -.->|Audit Log| OBS5[Telemetry]:::obs
    
    %% Feedback Loop for Model Improvement
    SCHEMA -.->|Fine-tuning<br/>Dataset| OBS5
  end

  %% ==========================================
  %% GLOBAL OBSERVABILITY LAYER
  %% ==========================================
  subgraph OBS_GLOBAL [Distributed Tracing]
    OBS1 & OBS2 & OBS3 & OBS4 & OBS5 --> TRACE[(Trace Store)]:::obs
    TRACE --> DASH[Monitoring Dashboard]:::obs
  end

  %% --- STYLE OVERRIDES ---
  style RAG_FLOW fill:#f5f5f5,stroke:#333,stroke-width:1px
  style ACT_FLOW fill:#f5f5f5,stroke:#333,stroke-width:1px
  style CHAT_FLOW fill:#f5f5f5,stroke:#333,stroke-width:1px
  style REVIEW fill:#fafafa,stroke:#666,stroke-width:2px
  style RETRY fill:#fff8e1,stroke:#ff6f00,stroke-width:2px
```
