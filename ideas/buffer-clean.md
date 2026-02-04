## commun1 flow — Entrée & normalisation

```mermaid
flowchart TD
  U[User input] --> NORM[Normalize<br/>lang detect, sanitize, classify]
  NORM --> INTENT[Intent + constraints<br/>task type, sensitivity, scope]
  INTENT --> CTX[Build minimal context<br/>session + user prefs + safety]
```

---

## commun2 flow — Routage & stratégie

```mermaid
flowchart TD
  CTX[Context ready] --> ROUTER{Route strategy}
  ROUTER -->|Chat / simple| S1[Direct LLM]
  ROUTER -->|Need internal knowledge| S2[RAG retrieval]
  ROUTER -->|Need external info| S3[Web search]
  ROUTER -->|Action / automation| S4[Plan + tools]
```

---

## commun3 flow — Génération + vérification (mid loop)

```mermaid
flowchart TD
  S1[Direct LLM] --> GEN[Draft answer]
  S2[RAG] --> GEN
  S3[Web] --> GEN
  S4[Plan] --> GEN

  GEN --> CHECK[Critique / verification<br/>consistency, policy, evidence]
  CHECK -->|fail| FIX[Repair: re-route / re-retrieve / re-plan]
  FIX --> GEN
  CHECK -->|ok| OUT[Final response]
```

---

## commun4 flow — Tool Gateway (sécurité, permissions, secrets)

```mermaid
flowchart TD
  PLAN[Planner decides an action] --> TG[Tool Gateway<br/>RBAC + allowlist + budgets]
  TG -->|allowed| EXEC[Execute tool call]
  TG -->|denied| DENY[Refuse + explain policy]
  EXEC --> AUD[Audit log + trace]
  EXEC --> RES[Return tool result]
  RES --> PLAN
```

---

## commun5 flow — Mémoire (staging → promoted)

```mermaid
flowchart TD
  OUT[Final response] --> EXTRACT[Extract memory candidates]
  EXTRACT --> STAGE[Staging memory<br/>type/scope/source/TTL/confidence]
  STAGE --> REVIEW{Promotion threshold met?}
  REVIEW -->|no| KEEP[Keep in staging]
  REVIEW -->|yes| PROMOTE[Promoted memory<br/>usable by default]
  PROMOTE --> HYGIENE[Hygiene job<br/>compress/forget/anti-corruption]
```

---

# function1 flow — Big document processing (carte + graphe + QA)

Plug sur **commun2** (route=RAG) + **commun3** (verification) + **commun5** (memory).

```mermaid
flowchart TD
  A[Document] --> PRE[Preprocess<br/>sections, pages, cleanup]
  PRE --> CH[Structured chunking<br/>titles + overlap]
  CH --> IDX[Index hybrid<br/>BM25 + vectors]

  IDX --> MAP[Build stable outline map]
  IDX --> GRAPH[Build concept graph<br/>edges require evidence]

  Q[User question] --> RET[Target retrieval<br/>5-12 passages max]
  RET --> READ[Evidence reading]
  READ --> ANS[Answer + citations]
  ANS --> VERIF[Auto-check<br/>missing/contradiction/extrapolation]
  VERIF -->|need more| RET
  VERIF -->|ok| MEM[Update external model<br/>diff-based + evidence]
```

---

# function2 flow — Student loop (feedback humain)

Plug sur **commun3** + **commun5**.

```mermaid
flowchart TD
  IN[User request] --> RESP[Generate answer]
  RESP --> OK{User validation?}

  OK -->|KO| WHY[Ask why / gather correction]
  WHY --> ADJ[Adjust strategy<br/>prompt, retrieval, tool use]
  ADJ --> RESP

  OK -->|OK| NEW{New rule/knowledge?}
  NEW -->|yes| STAGE[Stage memory item]
  STAGE --> PROM[Promote if repeated / trusted]
  NEW -->|no| END[Done]
```

---

# function3 flow — Worker loop (stateless orchestrator + memory)

Plug sur **commun1/2/3/5**.

```mermaid
flowchart LR
  UI[UI] --> ORCH[Orchestrator]
  ORCH --> MEMS[Session cache]
  ORCH --> MEMDB[Structured DB]
  ORCH --> MEMV[Vector store]

  ORCH --> LLM[LLM stateless]
  LLM --> ORCH

  ORCH --> EX[Extractor/scorer]
  EX --> MEMDB
  EX --> MEMV

  JOB[Periodic hygiene] --> MEMDB
  JOB --> MEMV
```

---

# function4 flow — Kubernetes / prod tool execution

Plug sur **commun4** (Tool Gateway) + **commun3** (verification) + audit.

```mermaid
flowchart TD
  REQ[Deploy/Operate request] --> PLAN[Plan steps]
  PLAN --> SAFE[Safety pre-check<br/>policy, env, blast radius]
  SAFE -->|ok| TG[Tool Gateway]
  SAFE -->|no| STOP[Refuse or propose safe alternative]

  TG --> EXEC[Run kubectl/helm/api]
  EXEC --> OBS[Observe results<br/>logs, metrics, status]
  OBS --> CHECK[Verify success<br/>tests/readiness/SLO]
  CHECK -->|fail| ROLL[Rollback / mitigation]
  ROLL --> OBS
  CHECK -->|ok| DONE[Report + audit]
```

---

## Version “assemblage” (vue d’ensemble modulaire)

Si tu veux une vue globale sans te noyer, voilà le câblage :

```mermaid
flowchart TD
  commun1[commun1: input normalize] --> commun2[commun2: routing]
  commun2 --> commun3[commun3: generate+verify]
  commun3 --> commun5[commun5: memory staging/promote]

  commun2 -->|Action| commun4[commun4: tool gateway]
  commun4 --> commun3

  commun2 -->|Doc QA| f1[function1: big doc processing]
  commun2 -->|Learning| f2[function2: student loop]
  commun2 -->|Agent runtime| f3[function3: worker loop]
  commun2 -->|K8s ops| f4[function4: k8s execution]

  f1 --> commun3
  f2 --> commun5
  f3 --> commun5
  f4 --> commun4
```
