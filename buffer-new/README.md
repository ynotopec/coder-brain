# Buffer-System: Multi-Phase AI Architecture

This implementation follows the architectural diagram from `buffer-new.md`, implementing a complete multi-phase AI system with RAG, action execution, tool building, and safety mechanisms.

## Architecture Overview

The system consists of 4 phases:

### Phase 1: Context & Intent
- `ContextBuilder`: Normalizes input and builds context from long-term memory
- `IntentRouter`: Classifies the type of query (query, action, hybrid, chat)
- `LongTermMemory`: Manages vector-based memory retrieval

### Phase 2: Execution Engines
- **RAG Pipeline**: Query planning, vector search, re-ranking, answer generation
- **Action Pipeline**: Tool planning, dry-run validation, risk checking, tool execution
- **ToolBuilder Sandbox**: Detects gaps, generates specs, implements, tests custom tools
- **Hybrid Orchestrator**: Coordinates multiple approaches
- **Chit-Chat & Safety**: Direct responses with light safety checks

### Phase 3: Response Aggregation
- `ResponseAggregator`: Combines results from multiple sources
- `FactChecker`: Verifies factual accuracy
- `SafetyValidator`: Ensures content policies compliance
- `ToolOutcomeValidator`: Validates tool execution results

### Phase 4: Output & Learning
- `RefinementManager`: Refines responses based on retry loops
- `OutputWriter`: Manages final output and observability
- `MemoryDecisionGate`: Decides if interactions should be saved
- `SchemaAndEmbedder`: Stores interactions in vector memory

## Installation

```bash
npm install
```

## Environment Setup

Create a `.env` file:

```
OPENAI_API_KEY=your_api_key_here
```

## Usage

### Basic Example

```javascript
import { BufferSystem } from './index.js';

const system = new BufferSystem();

const result = await system.processUserInput('Hello there!');

console.log(result);
```

### Advanced Usage with Custom Configuration

```javascript
import { BufferSystem } from './index.js';

const system = new BufferSystem({
  ragEnabled: true,
  actionEnabled: true,
  chatEnabled: true
});

const result = await system.processUserInput('What is 42 + 58?');
console.log(result);
```

### Interacting with Components Directly

```javascript
import {
  ContextBuilder,
  IntentRouter,
  ToolRegistry,
  VectorStore,
  ResponseAggregator
} from './src/index.js';

const llm = new OpenAIInterface(process.env.OPENAI_API_KEY);

const contextBuilder = new ContextBuilder(llm, vectorStore, longTermMemory);
const normalized = await contextBuilder.normalizeInput('My question here');
const context = await contextBuilder.buildContext(normalized);
const intent = await intentRouter.route(context);

console.log('Intent:', intent.intent);
```

## Component Documentation

### Phase 1: Context & Intent

#### ContextBuilder
Parses and normalizes user input, retrieves relevant context from memory.

```javascript
const input = "What's the weather in Paris?";
const normalized = await contextBuilder.normalizeInput(input);
const context = await contextBuilder.buildContext(normalized);
```

#### IntentRouter
Routes input to appropriate processing pipeline.

```javascript
const intent = await intentRouter.route(context);
// Returns: { intent: "query|action|hybrid|chat", confidence: 0.9, reasoning: "..." }
```

### Phase 2: Execution

#### RAG Engine
Handles document retrieval and answer generation.

```javascript
const results = await vectorStore.search('query');
const answer = await answerGenerator.generate(results, query);
```

#### Tool Registry
Manages available tools for action execution.

```javascript
const tool = await toolRegistry.getTool('tool-id');
const result = await toolRegistry.introspect('tool-id');
```

#### ToolBuilderSandbox
Automatically creates new tools for unmet requirements.

```javascript
const gap = await gapDetector.detectGap(context);
if (gap.needsNewTool) {
  const spec = await specGenerator.generateSpec(gap);
  const spec = await implementationGenerator.generateImplementation(spec);
  const approved = await hitlApprover.getApproval(spec, dryRunResult);
  if (approved) {
    await toolPromoter.promote(spec, implementation);
  }
}
```

### Phase 3 & 4: Aggregation & Output

See the main `BufferSystem` class for integrated workflow handling.

## Building Custom Tools

```javascript
const customTool = {
  id: 'my_tool',
  name: 'My Custom Tool',
  description: 'Does something useful',
  execute: async (params) => {
    const result = await performAction(params);
    return { success: true, data: result };
  },
  category: 'utility'
};

system.toolRegistry.registerTool(
  customTool.id,
  customTool.name,
  customTool.description,
  customTool.execute,
  customTool.category
);

// Now ready to use
const result = await system.processUserInput('Use my custom tool');
```

## Observability

All phases log to an observability log:

```javascript
const log = system.observabilityLog;
console.log(log.getStats());
// Returns: {
//   safetyCheckCount: 0,
//   policyValidationCount: 0,
//   errorCount: 0,
//   debugData: [...]
// }
```

## Error Handling

The system includes automatic retry logic:

```javascript
try {
  const result = await system.processUserInput(input);
} catch (error) {
  console.error('System error:', error);
}
```

## API Reference

### BufferSystem

The main orchestrator class.

**Constructor:**
```javascript
new BufferSystem(config)
```

**Methods:**
- `processUserInput(input)` - Main processing method
- `getObservabilityLog()` - Access the observability log

## Contributing

This is a complete implementation of the buffer-new architecture. To extend:

1. Add new components in the appropriate phases
2. Implement observability logging in your components
3. Add error handling with retry logic
4. Update the main orchestrator to integrate new features

## License

ISC