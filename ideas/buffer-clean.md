```mermaid
flowchart TD
  %% ==========================================
  %% STYLING DEFINITIONS
  %% ==========================================
  classDef db fill:#e3f2fd,stroke:#1565c0,stroke-width:2px;
  classDef logic fill:#fff3e0,stroke:#ef6c00,stroke-width:2px;
  classDef gate fill:#ffebee,stroke:#c62828,stroke-width:2px,shape:rhombus;
  classDef term fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,rx:5,ry:5;
  classDef crit fill:#f3e5f5,stroke:#7b1fa2,stroke-width:1px,stroke-dasharray: 5 5;
  classDef obs fill:#eceff1,stroke:#546e7a,stroke-width:1px,stroke-dasharray: 2 2;

  %% ==========================================
  %% PHASE 1: INPUT & CONTEXT
  %% ==========================================
  subgraph P1 [Phase 1: Context & Intent]
    direction TB
    User([User Input]):::term
    MEM[(Long-Term Memory)]:::db
    NORM[Normalize Input]:::logic
    BUILD[Context Builder]:::logic
    ROUTER{Intent Router}:::gate

    User --> NORM
    NORM --> BUILD
    MEM -.->|Retrieval| BUILD
    BUILD --> ROUTER
  end

  %% ==========================================
  %% PHASE 2: EXECUTION ENGINES
  %% ==========================================
  subgraph P2 [Phase 2: Execution Engines]
    direction TB
    REG[(Tool Registry)]:::db
    
    %% -- Routing Logic --
    ROUTER -->|Query| R_PLAN
    ROUTER -->|Task| A_PLAN
    ROUTER -->|Hybrid| HYB
    ROUTER -->|Chit-Chat| CHAT
    
    %% 1. RAG Flow
    R_PLAN[Query Planner]:::logic --> VEC_DB
    VEC_DB[(Vector Store)]:::db --> RERANK
    RERANK[Re-Rank & Filter]:::logic --> SUFF{Data Found?}:::gate
    SUFF -->|No| FALL[Fallback Message]:::logic
    SUFF -->|Yes| GEN[Generate Answer]:::logic

    %% 2. Action Flow
    A_PLAN[Action Planner]:::logic --> TOOL_OK{Tool Ready?}:::gate
    TOOL_OK -->|Yes| SIM
    TOOL_OK -->|No| GAP
    SIM[Dry Run / Validate]:::logic --> RISK{Risk Check}:::gate
    SIM -->|Missing/Incompatible| GAP
    RISK -->|High| HITL[Human Approval]:::term
    RISK -->|Safe| EXEC
    HITL -->|Approved| EXEC[Execute Tool]:::logic
    EXEC --> VERIFY{Verify Output}:::gate
    VERIFY -->|Fail| ROLL[Rollback / Compensate]:::logic

    %% 3. Hybrid Flow
    HYB[Hybrid Orchestrator]:::logic
    HYB --> R_PLAN
    HYB --> A_PLAN

    %% 4. Direct Flow
    CHAT[Direct Reply]:::logic --> CHAT_SAFE[Light Safety Check]:::crit
    CHAT_SAFE --> CHAT_PASS{Safe?}:::gate

    %% 5. ToolBuilder (isolated build env)
    subgraph TB_ENV [ToolBuilder Sandbox]
      direction TB
      GAP[Gap Detect]:::logic --> SPEC[Spec Gen]:::logic
      SPEC --> IMPL[Impl Gen]:::logic
      IMPL --> STATIC[Static Checks]:::logic
      STATIC --> TESTS[Unit + Prop Tests]:::logic
      TESTS --> T_POL{Policy Gate}:::gate
      T_POL -->|Pass| T_DRY[Dry Run]:::logic
      T_POL -->|Fail| TB_REJECT[Reject Proposal]:::logic
      T_DRY --> APPROVAL[Approval (HITL)]:::term
      APPROVAL -->|Approved| PROMO[Promotion]:::logic
      APPROVAL -->|Rejected| TB_REJECT
      PROMO --> REG
      PROMO --> SMOKE{Post-Deploy Verify}:::gate
      SMOKE -->|Pass| REPLAN[Re-Plan]:::logic
      SMOKE -->|Fail| TB_ROLL[Rollback]:::logic
      TB_ROLL --> REG
    end

    REPLAN --> A_PLAN
    TB_REJECT --> CHAT

    %% Registry introspection (no tool invention)
    A_PLAN -.->|Introspect| REG
    SIM -.->|Capability Check| REG

    %% ToolBuilder observability fan-in
    TB_OBS[(TB Logs & Metrics)]:::obs
    GAP -.-> TB_OBS
    SPEC -.-> TB_OBS
    IMPL -.-> TB_OBS
    STATIC -.-> TB_OBS
    TESTS -.-> TB_OBS
    T_POL -.-> TB_OBS
    T_DRY -.-> TB_OBS
    APPROVAL -.-> TB_OBS
    PROMO -.-> TB_OBS
    SMOKE -.-> TB_OBS
    TB_ROLL -.-> TB_OBS
    TB_REJECT -.-> TB_OBS
  end

  %% ==========================================
  %% PHASE 3: EVALUATION (System 2)
  %% ==========================================
  subgraph P3 [Phase 3: Review & Consolidation]
    direction TB
    AGG[Response Aggregator]:::logic
    PAR_CRIT[Parallel Eval]:::logic
    SCORE[Weighted Quality Score]:::logic
    POL_PASS{Policy Pass?}:::gate
    QUAL_PASS{Quality Pass?}:::gate

    %% Grouping Critics
    subgraph CRITICS [Critique Modules]
      style CRITICS fill:#ffffff,stroke:#999,stroke-dasharray: 5 5
      F_C[Fact Checker]:::crit
      S_C[Safety/Policy]:::crit
      T_C[Tool Outcome]:::crit
    end

    %% Aggregation Inputs
    GEN --> AGG
    FALL --> AGG
    VERIFY -->|Pass| AGG
    ROLL -->|Report| AGG
    
    %% Evaluation Flow
    AGG --> PAR_CRIT
    PAR_CRIT -.-> F_C & S_C & T_C
    F_C & T_C -.-> SCORE
    S_C --> POL_PASS
    
    %% Gating
    POL_PASS -->|Yes| SCORE
    SCORE --> QUAL_PASS
  end

  %% ==========================================
  %% PHASE 4: OUTPUT & LOOPS
  %% ==========================================
  subgraph P4 [Phase 4: Output & Learning]
    direction TB
    FORCE_EXIT[Generate Apology]:::logic
    RETRY{Max Retries?}:::gate
    REFINE[Refinement Manager]:::logic
    FINAL([Final Response]):::term
    USER_FB[/User Signal/Feedback/]:::term
    MEM_POL{Worth Keeping?}:::gate
    MEM_WRITE[Schema & Embed]:::logic
    
    %% Failure Handling
    POL_PASS -->|No| FORCE_EXIT
    CHAT_PASS -->|No| FORCE_EXIT
    
    %% Quality Loop
    QUAL_PASS -->|No| RETRY
    RETRY -->|Limit Reached| FORCE_EXIT
    RETRY -->|Under Limit| REFINE
    
    %% Finalizing
    QUAL_PASS -->|Yes| FINAL
    FORCE_EXIT --> FINAL
    CHAT_PASS -->|Yes| FINAL

    %% Memory Loop
    FINAL --> USER_FB
    USER_FB --> MEM_POL
    MEM_POL -->|Yes| MEM_WRITE
    MEM_WRITE --> MEM
  end

  %% ==========================================
  %% GLOBAL LINKS & OBSERVABILITY
  %% ==========================================
  
  %% Retry Loop Back to Phase 1
  REFINE -.->|Inject Error Context| BUILD

  %% Observability (Dotted lines to keep graph clean)
  OBS[(Observability Log)]:::obs
  EXEC -.-> OBS
  ROLL -.-> OBS
  TB_OBS -.-> OBS
  FORCE_EXIT -.-> OBS
  FINAL -.-> OBS
```
