# State Flow (Router + Critical Test Sequence)

Ce document capture la logique d'état opérationnelle du projet.

## A) Router / Decision Flow

```mermaid
stateDiagram-v2
    [*] --> ReceiveInput
    ReceiveInput --> BuildContext: normalize + retrieve memory
    BuildContext --> RouteIntent

    state RouteIntent <<choice>>
    RouteIntent --> QueryPath: intent = query
    RouteIntent --> ActionPath: intent = action
    RouteIntent --> HybridPath: intent = hybrid
    RouteIntent --> ChatPath: intent = chat

    QueryPath --> Aggregate
    ActionPath --> Aggregate
    HybridPath --> Aggregate
    ChatPath --> Aggregate

    Aggregate --> RefineOutput
    RefineOutput --> MemoryDecision

    state MemoryDecision <<choice>>
    MemoryDecision --> PersistMemory: worth_keeping = true
    MemoryDecision --> SkipMemory: worth_keeping = false

    PersistMemory --> FinalResponse
    SkipMemory --> FinalResponse
    FinalResponse --> [*]
```

## B) Single sequence for a critical test case

Cas critique retenu : **intent `hybrid`**, où la sortie multi-moteurs doit être transmise telle quelle vers l'agrégation (couverture par `test/architecture-alignment.test.js`).

```mermaid
sequenceDiagram
    participant U as User
    participant B as BrainSystem
    participant IR as IntentRouter
    participant H as HybridOrchestrator
    participant A as ResponseAggregator

    U->>B: process("hybrid question")
    B->>IR: classify intent
    IR-->>B: intent=hybrid

    B->>H: orchestrate(context)
    H-->>B: {rag, action, chat}

    B->>A: aggregate({rag, action, chat})
    A-->>B: source + response + qualityScore

    B-->>U: final response (phase=source)
```

### Reference test
- `BrainSystem hybrid intent forwards hybrid pipeline results into aggregation inputs`
