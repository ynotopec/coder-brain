# buffer2

## student — boucle d'apprentissage

- Routeur choisit LLM simple, RAG interne, recherche web ou plan d'action.
- Contrôle qualité humain : validation ou explication de l'utilisateur si KO.
- Escalade possible vers un groupe humain pour débloquer.
- Les corrections validées sont mémorisées (RAG) pour éviter de répéter les erreurs.

```mermaid
flowchart TD
    Start([User Input]) --> Router{"Analyze intent<br/>Select tool?"}

    Router -->|Simple or chit chat| DirectLLM["LLM (no context)"]
    Router -->|Internal info| Retrieval["RAG: retrieve docs"]
    Router -->|External info| WebSearch["Internet search"]
    Router -->|Action or task| PlanTask["Plan and execute task"]

    Retrieval --> CheckSize{"Context small enough?"}
    WebSearch --> CheckSize
    PlanTask --> CheckSize
    CheckSize -->|Yes| OutputGen["LLM generates response"]
    CheckSize -->|No| Reduce["Summarize or extract key info"]
    Reduce --> OutputGen
    DirectLLM --> OutputGen

    OutputGen --> UserCheck{"User validation<br/>Is it OK?"}
    UserCheck -->|KO| AskWhy[Ask user why it is KO]
    AskWhy --> HumanExplain[User details correction]
    HumanExplain --> StrategySwitch{"Strategy change?"}
    StrategySwitch -->|Refine prompt| Refine[Update context with user feedback]
    StrategySwitch -->|Ask humans| AskGroup[Escalate to group or community]
    Refine --> OutputGen
    AskGroup --> GroupAnswer[Human answer received]
    GroupAnswer --> OutputGen

    UserCheck -->|OK| IsNewKnowledge{"Corrected or from group?"}
    IsNewKnowledge -->|Yes, learned| MemoryUpdate["Save to vector DB/RAG\\n(continuous learning)"]
    IsNewKnowledge -->|No, standard| End([Final Output])
    MemoryUpdate --> End
```

## worker — LLM + mémoire

- LLM stateless, orchestrateur décide quoi lire/écrire.
- Mémoire courte (cache) et longue (DB + vecteurs) synchronisées via extracteur.
- Job périodique résume, compresse et supprime selon importance/TTL.
- Entrées docs/logs alimentent le vector store et la base structurée.

```mermaid
flowchart LR
    subgraph "Client"
        U["Utilisateur"]
        UI["Interface (chat, app web)"]
    end

    subgraph "Backend IA"
        ORCH["Orchestrateur<br/>(Agent / API)"]

        subgraph MEM["Services de mémoire"]
            MEM_ST["Memoire de session<br/>(cache/Redis)"]
            MEM_LT_DB[("Base de données<br/>(facts structurés)")]
            MEM_LT_VEC[("Vector store<br/>(embeddings)")]
        end

        LLM["LLM stateless"]
        EXTRACTOR["Module d'extraction<br/>et scoring de mémoire"]
        SCHED["Job périodique<br/>(maintenance & oubli)"]
    end

    subgraph SourcesEnv["Environnement & Connaissance"]
        DOCS["Docs internes / WIKI / API"]
        LOGS["Logs / Incidents fréquents"]
    end

    U --> UI
    UI --> ORCH

    ORCH --> MEM_ST
    ORCH --> MEM_LT_DB
    ORCH --> MEM_LT_VEC

    ORCH -->|contexte + question| LLM
    LLM -->|réponse| ORCH

    ORCH -->|candidats de mémoire| EXTRACTOR
    EXTRACTOR -->|facts + importance| MEM_LT_DB
    EXTRACTOR --> MEM_LT_VEC

    SCHED --> MEM_LT_DB
    SCHED --> MEM_LT_VEC

    DOCS --> MEM_LT_VEC
    DOCS --> MEM_LT_DB
    LOGS --> MEM_LT_VEC
    LOGS --> MEM_LT_DB
```

## coder — stack Kubernetes

- Open WebUI en frontal via Ingress ; LiteLLM gère proxy OpenAI et tool calling.
- vLLM (ou LLM externe) sert les modèles ; LangGraph orchestre les agents.
- Qdrant/pgvector + Postgres + MinIO stockent contexte, états et documents.
- Outils métier (CI/CD, ticketing, monitoring) exposés comme services séparés.
- Langfuse + Prometheus/Grafana assurent traçabilité et observabilité.

```mermaid
flowchart LR
    %% Utilisateur / Ingress
    U["Utilisateur<br/>(Web / IDE / App)"] -->|HTTPS| ING["Ingress<br/>(public)"]

    subgraph ns-frontend[Namespace: ai-frontend]
      OW["Open WebUI<br/>(Service Chat UI)"]
    end

    subgraph ns-gateway[Namespace: ai-gateway]
      LT["LiteLLM Proxy<br/>(API OpenAI-compatible<br/>+ Tool Calling)"]
    end

    subgraph ns-models[Namespace: ai-models]
      VLLM["vLLM<br/>(Serving LLM OSS)"]
      EXTAPI["LLM externes<br/>(optionnel)"]
    end

    subgraph ns-knowledge[Namespace: ai-knowledge]
      MINIO["MinIO / S3<br/>Documents bruts"]
      PG["Postgres<br/>Métadonnées + contextes"]
      VEC["Qdrant / pgvector<br/>Index vectoriel"]
    end

    subgraph ns-orchestrator[Namespace: ai-orchestrator]
      LG["LangGraph<br/>(Agents / Workflows)"]
      CTX["Context Manager<br/>(Workspaces, résumés)"]
    end

    subgraph ns-tools[Namespace: ai-tools]
      T1["Tool: ticketing<br/>(FastAPI)"]
      T2["Tool: CI/CD<br/>(Deploy, Jobs)"]
      T3["Tool: Monitoring<br/>(Logs, Metrics)"]
    end

    subgraph ns-observability[Namespace: ai-observability]
      LF["Langfuse<br/>(Tracing LLM / Tools)"]
      PROM[(Prometheus)]
      GRAF[Grafana]
    end

    %% Routing principal
    ING --> OW
    OW -->|API OpenAI| LT

    LT -->|chat/completions| VLLM
    LT -->|proxy optionnel| EXTAPI

    %% Appels outils (tool calling)
    LT -->|tools.*| LG

    LG -->|RAG / search| VEC
    LG -->|docs| MINIO
    LG -->|state + metadata| PG
    LG -->|gestion contexte| CTX

    LG -->|Appels outils| T1
    LG -->|Appels outils| T2
    LG -->|Appels outils| T3

    %% Observabilité
    LT -->|traces| LF
    LG -->|traces| LF
    T1 -->|traces| LF
    T2 -->|traces| LF
    T3 -->|traces| LF

    LF --> PROM
    PROM --> GRAF

```
