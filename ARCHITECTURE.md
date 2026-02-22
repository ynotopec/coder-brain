# Brain-System Architecture Implementation
# Following brain architecture draft mermaid diagram

## Project Structure

```
brain-system/
├── .env.example           # Environment variables template
├── .gitignore            # Git ignore file
├── package.json          # Project configuration
├── README.md             # Documentation
├── examples/             # Usage examples
│   └── demo.js
├── test.js               # Quick test script
└── src/
    ├── index.js          # Main orchestrator (phase 4 output + entry)
    ├── common.js         # Base interface for LLM and common utilities
    ├── common/
    │   └── schema.js     # Memory and knowledge base schema
    ├── phase1/
    │   └── context.js    # Intent, context, and memory (Phase 1)
    ├── phase2/
    │   ├── rag-engine.js # RAG pipeline (Phase 2)
    │   ├── action-engine.js # Action execution (Phase 2)
    │   ├── toolbuilder-sandbox.js # Custom tool creation (Phase 2)
    │   ├── hybrid-orchestrator.js # Multi-approach coordination (Phase 2)
    │   └── chat-safety.js # Safe chat responses (Phase 2)
    ├── phase3/
    │   └── response-aggregator.js # Response quality validation (Phase 3)
    └── phase4/
        └── output-learning.js # Output and memory (Phase 4)
```

## Implementation Notes

### Phase 1: Context & Intent
- ✅ ContextBuilder - Input normalization and context building
- ✅ IntentRouter - Query classification
- ✅ LongTermMemory - Vector memory retrieval

### Phase 2: Execution Engines
- ✅ RAG Pipeline - QueryPlanner, VectorStore, Reranker, AnswerGenerator
- ✅ Action Pipeline - ActionPlanner, DryRunValidator, RiskChecker, ToolExecutor
- ✅ ToolBuilder Sandbox - GapDetection, SpecGeneration, ToolPromotion
- ✅ Hybrid Orchestrator - Multi-source orchestration
- ✅ Chat & Safety - DirectReplier, SafetyChecker, ObservabilityLog

### Phase 3: Response Aggregation
- ✅ ResponseAggregator - Combines multiple responses
- ✅ FactChecker - Factual accuracy verification
- ✅ SafetyValidator - Policy compliance
- ✅ ToolOutcomeValidator - Execution validation

### Phase 4: Output & Learning
- ✅ RefinementManager - Response refinement
- ✅ OutputWriter - Final output and logging
- ✅ MemoryDecisionGate - Worth-keeping decision
- ✅ SchemaAndEmbedder - Storage integration

## Key Features

### Automatic Tool Discovery
When actions fail, the system automatically detects gaps and creates proper tool specifications with approval gates.

### Safety Verification
All phases include safety checks, policy validation, and error handling with automatic retry logic.

### Observability Tracking
Every phase logs to an observability log for debugging and monitoring.

### Vector Memory
Long-term memory uses vector search with cosine similarity for retrieval.

### Quality Scoring
Responses are scored based on multiple factors: factual accuracy, relevance, clarity, and completeness.

## Testing

```bash
npm install
cp .env.example .env
# Add your OpenAI API key to .env
node src/index.js
```