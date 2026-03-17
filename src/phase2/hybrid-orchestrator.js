/**
 * HybridOrchestrator - coordinates multiple processing pipelines (RAG, Action, Chat)
 */
import { VectorStore } from './rag-engine.js';
import { ToolRegistry } from './action-engine.js';
import { AnswerGenerator } from './rag-engine.js';

/**
 * Configurable hybrid orchestrator for routing queries across multiple processing backends
 */
export class HybridOrchestrator {
  /**
   * Create a hybrid orchestrator with configurable pipelines
   * @param {Object} config - Configuration options
   * @param {boolean} config.ragEnabled - Enable RAG pipeline (default: true)
   * @param {boolean} config.actionEnabled - Enable action API calls (default: true)
   * @param {boolean} config.chatEnabled - Enable chat responses (default: true)
   * @param {VectorStore} config.vectorStore - Custom vector store instance
   * @param {ToolRegistry} config.toolRegistry - Custom tool registry instance
   */
  constructor(config = {}) {
    this.ragEnabled = config.rag_enabled !== false;
    this.actionEnabled = config.action_enabled !== false;
    this.chatEnabled = config.chat_enabled !== false;
    this.vectorStore = config.vectorStore || new VectorStore(null);
    this.toolRegistry = config.toolRegistry || new ToolRegistry();
    this.chatHandler = config.chat_handler || null;
    this.actionHandler = config.action_handler || null;
    this.simulationEnabled = config.simulation_enabled === true || process.env.BUFFER_SIMULATION === 'true';
  }

  /**
   * Orchestrate a multi-pipeline response across available backends
   * @param {Object} context - Query context object with processed query data
   * @param {Object} options - Processing options (allowFallback, maxRetries)
   * @returns {Promise<Object>} Combined results from all pipelines with final selection
   */
  async orchestrate(context, options = {}) {
    const results = {
      rag: null,
      action: null,
      chat: null,
      fusionScore: 0.5
    };

    const optionsConfig = { allowFallback: true, maxRetries: 2 };

    // Execute available pipelines concurrently where possible
    if (this.ragEnabled) {
      results.rag = await this.runRagPipeline(context).catch(error => {
        console.error('[Hybrid]', 'RAG failed:', error.message);
        return null;
      });
    }

    if (this.actionEnabled) {
      results.action = await this.runActionPipeline(context).catch(error => {
        console.error('[Hybrid]', 'Action failed:', error.message);
        return null;
      });
    }

    if (this.chatEnabled) {
      results.chat = await this.runChatPipeline(context).catch(error => {
        console.error('[Hybrid]', 'Chat failed:', error.message);
        return null;
      });
    }

    results.final = this.composeResponse(results, context);

    if (!results.final && optionsConfig.allowFallback) {
      console.warn('[HYBRID] No valid response found, using chat fallback');
      results.final = results.chat;
    }

    return results;
  }

  /**
   * RAG pipeline - retrieves knowledge from vector store and generates contextual answer
   * @param {Object} context - Query context with query text and metadata
   * @returns {Promise<Object|null>} RAG response with answer and confidence score
   */
  async runRagPipeline(context) {
    try {
      const queryVector = await this.vectorStore.embed(context.context || '');
      const results = await this.vectorStore.search(queryVector, 5);
      
      if (results.length === 0) return null;
      
      const generator = new AnswerGenerator(null);
      return await generator.generate(results, context.context || 'General query');
    } catch (error) {
      console.error('[RAG Pipeline Failed]', error.message);
      return null;
    }
  }

  /**
   * Action pipeline - executes tool-based operations based on user request
   * @param {Object} context - Query context with intent and entity information
   * @returns {Promise<Object|null>} Tool execution result or null
   */
  async runActionPipeline(context) {
    try {
      if (this.actionHandler) {
        return await this.actionHandler(context);
      }

      if (!this.simulationEnabled) {
        return null;
      }

      const tools = this.toolRegistry.getAllTools();
      if (!tools || tools.length === 0) return null;

      const targetTool = this.selectTargetTool(tools, context);
      return {
        tool: targetTool,
        execution: 'simulated',
        success: true
      };
    } catch (error) {
      console.error('[Action Pipeline Failed]', error.message);
      return null;
    }
  }

  /**
   * Chat pipeline - provides conversational fallback responses
   * @param {Object} context - Query context for chat generation
   * @returns {Promise<Object|null>} Chat response with message and confidence
   */
  async runChatPipeline(context) {
    if (this.chatHandler) {
      return await this.chatHandler(context);
    }

    return {
      message: '',
      type: 'chat',
      confidence: 0
    };
  }

  /**
   * Score and select the best pipeline result based on confidence scores
   * @param {Object} results - All pipeline execution results
   * @param {Object} context - Original query context for routing decisions
   * @returns {Object} Selected response with approach metadata
   */
  composeResponse(results, context) {
    const ragScore = results.rag?.confidence || 0;
    const actionSuccess = results.action?.success ? 1.0 : 0;
    const chatScore = results.chat?.confidence || 0;

    const scores = [ragScore, actionSuccess, chatScore];
    const maxScore = Math.max(...scores);
    
    if (maxScore === 0) return null;
    
    const winningIndex = scores.indexOf(maxScore);
    const approaches = ['rag', 'action', 'chat'];
    
    const selectedApproach = approaches[winningIndex];

    return {
      approach: selectedApproach,
      response: results[selectedApproach]?.response || results[selectedApproach]?.message,  
      confidence: maxScore > 0 ? maxScore : 0,
      sources: results.rag?.sources || [],
      fallback: maxScore < 0.5
    };
  }

  /**
   * Dynamically re-route query if initial pipeline fails
   * @param {Object} context - Query context for new routing decision
   * @param {string} failedPhase - Identifier of the phase that failed
   * @returns {Promise<Object>} New routing plan with approach and reasoning
   */
  async rePlan(context, failedPhase) {
    console.info('[HYBRID] Re-planning after', failedPhase, 'phase failure');

    try {
      const fallbackApproaches = ['chat', 'rag', 'action'];
      
      for (const approach of fallbackApproaches) {
        if (approach !== failedPhase && this[approach + 'Enabled']) {
          return {
            newApproach: approach,
            reasoning: `Retrying with ${approach} after ${failedPhase} failure`,
            timestamp: Date.now()
          };
        }
      }

      const defaultStrategy = failedPhase === 'action' ? 'chat'
                          : failedPhase === 'chat' ? 'rag'
                          : 'action';
      
      return {
        newApproach: defaultStrategy,
        reasoning: `Failed phase=${failedPhase} defaulted to ${defaultStrategy}`,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('[RePlan Failed]', error.message);
      
      return {
        newApproach: 'chat',
        reasoning: `Fallback after re-plan failure`,
        timestamp: Date.now()
      };
    }
  }
}
