import { VectorStore, AnswerGenerator } from './rag-engine.js';
import { ToolRegistry } from './action-engine.js';

export class HybridOrchestrator {
  constructor(config = {}) {
    this.ragEnabled = config.ragEnabled !== false;
    this.actionEnabled = config.actionEnabled !== false;
    this.chatEnabled = config.chatEnabled !== false;
    this.vectorStore = config.vectorStore || new VectorStore();
    this.toolRegistry = config.toolRegistry || new ToolRegistry();
    this.chatHandler = config.chatHandler || null;
    this.actionHandler = config.actionHandler || null;
    this.simulationEnabled = config.simulationEnabled === true || process.env.BUFFER_SIMULATION === 'true';
  }

  async orchestrate(context, options = {}) {
    const results = {
      rag: null,
      action: null,
      chat: null,
      final: null
    };

    const { allowFallback = true, maxRetries = 2 } = options;

    if (this.ragEnabled) {
      results.rag = await this.runRagPipeline(context);
    }

    if (this.actionEnabled) {
      results.action = await this.runActionPipeline(context);
    }

    try {
      results.chat = await this.runChatPipeline(context);
    } catch (e) {
      results.chat = { error: e.message };
    }

    results.final = this.composeResponse(results, context);

    if (!results.final && allowFallback && results.chat) {
      console.warn('[HYBRID] No valid response found, using chat fallback');
      results.final = results.chat;
    }

    return results;
  }

  async runRagPipeline(context) {
    try {
      const results = await this.vectorStore.search('');
      const generator = new AnswerGenerator(null);
      return await generator.generate(results, context.context);
    } catch (e) {
      console.error('[RAG] Pipeline failed:', e.message);
      return null;
    }
  }

  async runActionPipeline(context) {
    try {
      if (this.actionHandler) {
        return await this.actionHandler(context);
      }

      if (!this.simulationEnabled) {
        return null;
      }

      const execution = await this.toolRegistry.introspect('example_tool');
      if (!execution) {
        return null;
      }

      const tools = this.toolRegistry.getAllTools();
      return {
        tool: tools[0],
        execution: 'simulated'
      };
    } catch (e) {
      console.error('[ACTION] Pipeline failed:', e.message);
      return null;
    }
  }

  async runChatPipeline(context) {
    if (this.chatHandler) {
      return await this.chatHandler(context);
    }

    if (!this.simulationEnabled) {
      throw new Error('No chat handler configured for hybrid pipeline');
    }

    return {
      message: `Chat response for: ${context.context}`,
      type: 'chat',
      confidence: 0.8
    };
  }

  composeResponse(results, context) {
    const scores = [
      results.rag?.confidence || 0,
      results.action?.success ? 0.9 : 0,
      results.chat?.confidence || 0
    ];

    const maxScore = Math.max(...scores);
    const maxIndex = scores.indexOf(maxScore);

    return {
      approach: ['rag', 'action', 'chat'][maxIndex],
      response: results[[ 'rag', 'action', 'chat' ][maxIndex]]?.response || 'Response not available',
      confidence: maxScore,
      sources: results.rag?.sources || [],
      fallback: maxScore < 0.5
    };
  }

  async rePlan(context, phase) {
    console.log(`[HYBRID Re-Plan] Re-planning after ${phase} phase failure`);

    try {
      const prompt = `Re-plan for this context after failure.

Context: "${context.context}"
Failed Phase: ${phase}

Return JSON: { new_approach: "rag|action|chat", reasoning: "..." }`;

      if (!this.simulationEnabled) {
        throw new Error('Hybrid re-plan requires simulation mode or a real planner implementation');
      }

      const response = '{"new_approach": "chat", "reasoning": "simulation mode"}';
      const result = JSON.parse(response);
      return {
        newApproach: result.new_approach,
        reasoning: result.reasoning
      };
    } catch (e) {
      return {
        newApproach: 'chat',
        reasoning: 'Re-plan failed, defaulting to chat'
      };
    }
  }
}

export class ReconciliationManager {
  constructor(llm) {
    this.llm = llm;
  }

  async reconcile(conflictingResults) {
    const prompt = `Reconcile these competing results and select the best one.

Results: ${JSON.stringify(conflictingResults)}

Return a JSON object with:
{
  "selected_result": {
    "approach": "selected approach",
    "response": "selected response",
    "confidence": 0.0 to 1.0
  },
  "reconciliation_notes": "why this was selected",
  "potential_conflicts": ["list of potential conflicts"]
}`;

    const response = await this.llm.generateCompletion([
      { role: 'user', content: prompt }
    ]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return {
        selected_result: conflictingResults[0],
        reconciliation_notes: 'Default selection',
        potential_conflicts: []
      };
    }
  }

  async prioritizeQuality(predictions) {
    const prompt = `Prioritize these candidate responses by quality.

Candidates: ${JSON.stringify(predictions)}

Return JSON: { prioritized: 0, score: 0.0 }`;

    const response = {};
    const result = JSON.parse(response);
    return {
      prioritized: result.prioritized,
      score: result.score
    };
  }
}