/**
 * Response Aggregator - combines and evaluates multi-pipeline responses
 */
import { DirectReplier } from '../phase2/chat-safety.js';
import { parseJsonOr } from '../common.js';

/**
 * ResponseAggregator - selects best response from multiple sources
 */
export class ResponseAggregator {
  /**
   * Create a response aggregator for multi-pipeline selection
   * @param {OpenAIInterface} llm - OpenAI interface for quality evaluation
   */
  constructor(llm) {
    this.llm = llm;
    this.chatReplier = new DirectReplier(llm);
  }

  /**
   * Aggregate results from all pipeline sources and select best response
   * @param {Object} results - Results object with rag/action/chat properties
   * @param {Object} context - Query context for response selection
   * @returns {Promise<Object>} Best response with source and quality score
   */
  async aggregate(results, context) {
    const validResponses = [];

    if (results.rag && results.rag.has_information) {
      validResponses.push({
        source: 'rag',
        response: results.rag,
        score: results.rag.confidence || 0.7
      });
    }

    if (results.action && results.action.success) {
      validResponses.push({
        source: 'action',
        response: results.action,
        score: 0.8
      });
    }

    if (results.chat) {
      validResponses.push({
        source: 'chat',
        response: results.chat,
        score: results.chat.confidence || 0.7
      });
    }

    if (validResponses.length === 0) {
      try {
        const chatResult = await this.chatReplier.generateDirectReply(context.context || '');
        validResponses.push({
          source: 'chat',
          response: chatResult,
          score: 0.6
        });
      } catch (error) {
        console.error('[ResponseAggregator] Chat fallback failed:', error.message);
        const fallback = { message: 'Sorry, I could not process your request.', confidence: 0.5 };
        return {
          source: 'fallback',
          response: fallback,
          qualityScore: 0.5
        };
      }
    }

    return this.selectBestResponse(validResponses, context);
  }

  /**
   * Use LLM to select best response from candidates
   * @param {Array} candidates - Response candidates with scores
   * @param {Object} context - Query context
   * @returns {Object} Selected response metadata
   */
  async selectBestResponse(candidates, context) {
    const prompt = `Select the best response from these candidates.\n\nContext: "${context.context}"\nCandidates: ${JSON.stringify(candidates)}\n\nReturn a JSON object with:\n{\n  "selected": number,// index of selected candidate\n  "reasoning": string\n}`;

    try {
      const llmResponse = await this.llm.generateCompletion([{
        role: 'user',
        content: prompt,
        stream: false
      }]);

      const parsed = parseJsonOr(llmResponse, null);

      if (parsed && Number.isInteger(parsed.selected) && candidates[parsed.selected]) {
        const chosen = candidates[parsed.selected];
        return {
          source: chosen.source,
          response: parsed.combined_response || chosen.response,
          candidates_used: candidates.map(c => c.source),
          qualityScore: chosen.score
        };
      }
    } catch (error) {
      console.error('[ResponseAggregator.LLM] Selection failed:', error.message);
    }

    return this.simpleSelect(candidates);
  }

  /**
   * Simple selection by highest score - Fallback method
   * @param {Array} candidates - Response candidates with scores
   * @returns {Object} Best response by score
   */
  simpleSelect(candidates) {
    const sorted = [...candidates].sort((a, b) => b.score - a.score);
    return {
      source: sorted[0].source,
      response: sorted[0].response,
      candidates_used: candidates.map(c => c.source),
      qualityScore: sorted[0].score
    };
  }
}

/**
 * ParallelEvaluator - evaluates responses from different pipelines in parallel
 */
export class ParallelEvaluator {
  /**
   * Create a parallel evaluator for multi-response validation
   * @param {Object} ragResults - RAG pipeline results
   * @param {Object} actionResults - Action pipeline results
   * @param {Object} chatResults - Chat pipeline results
   * @param {OpenAIInterface} llm - OpenAI interface for quality evaluation
   */
  constructor(ragResults, actionResults, chatResults, llm) {
    this.ragResults = ragResults;
    this.actionResults = actionResults;
    this.chatResults = chatResults;
    this.llm = llm;
  }

  /**
   * Evaluate all available responses in parallel (or from passed instance)
   * @param {Object} resultsInstance - Optional instance with results for batching
   * @returns {Promise<Object>} Evaluation results for rag/action/chat
   */
  async evaluateAll(resultsInstance) {
    const evaluations = {
      rag: null,
      action: null,
      chat: null
    };

    this.ragResults = resultsInstance?.ragResults || this.ragResults;
    this.actionResults = resultsInstance?.actionResults || this.actionResults;
    this.chatResults = resultsInstance?.chatResults || this.chatResults;

    if (this.ragResults) {
      evaluations.rag = await this.evaluateRag();
    }
    if (this.actionResults) {
      evaluations.action = await this.evaluateAction();
    }
    if (this.chatResults) {
      evaluations.chat = await this.evaluateChat();
    }

    return evaluations;
  }

  /**
   * Evaluate RAG response quality based on confidence and source count
   * @returns {Object} RAG evaluation metrics
   */
  async evaluateRag() {
    if (!this.ragResults) return null;
    
    try {
      const context = {
        answer: this.ragResults.answer || '',
        sources: Array.isArray(this.ragResults.sources) ? this.ragResults.sources : [],
        confidence: typeof this.ragResults.confidence === 'number' 
          ? this.ragResults.confidence 
          : 0.5,
        has_information: Boolean(this.ragResults.has_information)
      };

      const validityScore = context.sources.length > 0
        ? Math.min(1, 0.6 + (context.sources.length * 0.1))
        : 0.3;

      return {
        score: validityScore,
        aspects: {
          factuality: context.has_information ? 0.8 : 0.4,
          relevance: context.confidence
        },
        sourceCount: context.sources.length
      };
    } catch (error) {
      console.error('[ParallelEvaluator.Rag] Evaluation failed:', error.message);
      return {
        score: 0.3,
        issues: ['Evaluation failed']
      };
    }
  }

  /**
   * Evaluate action/tool execution results
   * @returns {Object} Action execution evaluation metrics
   */
  async evaluateAction() {
    if (!this.actionResults) return null;

    try {
      const execution = {
        success: this.actionResults.success === true,
        toolId: this.actionResults.toolId || 'unknown',
        result: this.actionResults.result,
        verify: this.actionResults.verify || null
      };

      if (!execution.success) return { score: 0.2, issues: ['Tool execution failed'] };

      const outputValid = typeof execution.result === 'object' 
        && !Array.isArray(execution.result);

      return {
        score: outputValid ? 0.85 : 0.6,
        issues: outputValid ? [] : ['Unexpected tool result format']
      };
    } catch (error) {
      console.error('[ParallelEvaluator.Action] Evaluation failed:', error.message);
      return { score: 0.2, issues: ['Evaluation failed'] };
    }
  }

  /**
   * Evaluate chat response quality
   * @returns {Object} Chat response evaluation metrics
   */
  async evaluateChat() {
    if (!this.chatResults) return null;

    try {
      const chat = {
        message: this.chatResults.message || '',
        confidence: typeof this.chatResults.confidence === 'number'
          ? this.chatResults.confidence
          : 0.5,
        safety: this.chatResults.safety || null
      };

      const lengthValid = chat.message.length > 10 && chat.message.length < 5000;
      const safetyOk = !chat.safety || (chat.safety.needs_review === false);

      return {
        score: chat.confidence * (lengthValid ? 1.0 : 0.7) * (safetyOk ? 1.0 : 0.5),
        sentiment: 'neutral',
        metrics: { messageLength: chat.message.length }
      };
    } catch (error) {
      console.error('[ParallelEvaluator.Chat] Evaluation failed:', error.message);
      return { score: 0.3, issues: ['Evaluation failed'] };
    }
  }
}

/**
 * FactChecker - validates factual accuracy of responses
 */
export class FactChecker {
  /**
   * Create a fact checking service
   * @param {OpenAIInterface} llm - OpenAI interface for fact verification
   */
  constructor(llm) {
    this.llm = llm;
  }

  /**
   * Verify if response answer is factually supported by context
   * @param {Object} context - Context with query and references
   * @param {Object} response - Response to validate
   * @returns {Promise<Object>} Fact verification result
   */
  async checkFact(context, response) {
    try {
      const prompt = `Verify if this claim in the response is factually correct.\n\nContext: "${context.context}"\nResponse: "${response.answer}"`;

      const llmResponse = await this.llm.generateCompletion([{
        role: 'user',
        content: prompt,
        stream: false
      }]);

      return parseJsonOr(llmResponse, {
        factually_correct: true,
        supported_by_context: true,
        confidence: 0.7,
        contradictions: []
      });
    } catch (error) {
      console.error('[FactChecker] Fact verification failed:', error.message);
      return {
        factually_correct: false,
        supported_by_context: false,
        confidence: 0.3
      };
    }
  }

  /**
   * Extract key facts from response for verification
   * @param {Object} context - Query context
   * @param {Object} response - Response with answer to extract facts
   * @returns {Promise<Array>} List of extracted facts
   */
  async extractFacts(context, response) {
    try {
      const prompt = `Extract key facts from this response.\n\nContext: "${context.context}"\nResponse: "${response.answer}"`;

      const llmResponse = await this.llm.generateCompletion([{
        role: 'user',
        content: prompt,
        stream: false
      }]);

      return parseJsonOr(llmResponse, []);
    } catch (error) {
      console.error('[FactChecker] Fact extraction failed:', error.message);
      return [];
    }
  }
}

/**
 * SafetyPolicyValidator - validates safety compliance of responses
 */
export class SafetyPolicyValidator {
  /**
   * Create a safety policy validator
   * @param {OpenAIInterface} llm - OpenAI interface for policy checking
   */
  constructor(llm) {
    this.llm = llm;
  }

  /**
   * Validate response complies with safety policies
   * @param {Object} response - Response to validate (has answer field)
   * @param {Object} context - Context for context-aware validation
   * @returns {Promise<Object>} Safety check result
   */
  async validateSafety(response, context) {
    try {
      const prompt = `Check if this response complies with safety policies.\n\nContext: "${context.context}"\nResponse: "${response.answer}"`;

      const llmResponse = await this.llm.generateCompletion([{
        role: 'user',
        content: prompt,
        stream: false
      }]);

      return parseJsonOr(llmResponse, { safe: true, violations: [], severity: 'low' });
    } catch (error) {
      console.error('[SafetyPolicyValidator] Safety check failed:', error.message);
      return { safe: true, violations: [], severity: 'low' };
    }
  }

  /**
   * Validate response content quality metrics
   * @param {Object} response - Response with fields to validate
   * @param {Object} context - Query context for context-aware validation
   * @returns {Promise<Object>} Quality assessment result
   */
  async validateResponseContent(response, context) {
    try {
      const prompt = `Validate response content quality.\n\nContext: "${context.context}"\nResponse: ${JSON.stringify(response)}`;

      const llmResponse = await this.llm.generateCompletion([{
        role: 'user',
        content: prompt,
        stream: false
      }]);

      return parseJsonOr(llmResponse, {
        quality_score: 0.5,
        relevance: 0.5,
        clarity: 0.5,
        completeness: 0.5
      });
    } catch (error) {
      console.error('[SafetyPolicyValidator] Quality check failed:', error.message);
      return { quality_score: 0.4, relevance: 0.5, clarity: 0.5, completeness: 0.5 };
    }
  }
}

/**
 * ToolOutcomeValidator - validates tool execution results
 */
export class ToolOutcomeValidator {
  /**
   * Create a tool outcome validator
   * @param {OpenAIInterface} llm - OpenAI interface for validation
   */
  constructor(llm) {
    this.llm = llm;
  }

  /**
   * Validate that tool execution produced successful results
   * @param {string} toolId - Executed tool identifier
   * @param {Object} parameters - Tool input parameters
   * @param {*} result - Tool output result
   * @returns {Promise<Object>} Validation result
   */
  async validateToolExecution(toolId, parameters, result) {
    try {
      const prompt = `Validate this tool execution result.\n\nTool: ${toolId}\nParameters: ${JSON.stringify(parameters)}\nResult: ${JSON.stringify(result)}`;

      const llmResponse = await this.llm.generateCompletion([{
        role: 'user',
        content: prompt,
        stream: false
      }]);

      return parseJsonOr(llmResponse, {
        valid_execution: true,
        issues: [],
        success_criteria_met: true
      });
    } catch (error) {
      console.error('[ToolOutcomeValidator] Execution validation failed:', error.message);
      return {
        valid_execution: false,
        issues: ['Validation failed'],
        success_criteria_met: false
      };
    }
  }

  /**
   * Verify actual output matches expected output for testing
   * @param {string} toolId - Tool identifier being tested
   * @param {*} expectedOutput - Expected test result
   * @param {*} actualOutput - Actual test result
   * @returns {Promise<Object>} Match verification result
   */
  async verifyOutputExpectations(toolId, expectedOutput, actualOutput) {
    try {
      const prompt = `Verify if actual output matches expected output.\n\nTool: ${toolId}\nExpected: ${JSON.stringify(expectedOutput)}\nActual: ${JSON.stringify(actualOutput)}`;

      const llmResponse = await this.llm.generateCompletion([{
        role: 'user',
        content: prompt,
        stream: false
      }]);

      return parseJsonOr(llmResponse, { matches: true, differences: [] });
    } catch (error) {
      console.error('[ToolOutcomeValidator] Output verification failed:', error.message);
      return { matches: false, differences: ['Verification failed'] };
    }
  }
}

/**
 * QualityScoreCalculator - computes weighted quality scores for responses
 */
export class QualityScoreCalculator {
  /**
   * Create a quality calculator with configurable metric weights
   */
  constructor() {
    this.weights = {
      factual_accuracy: 0.4,
      relevance: 0.3,
      clarity: 0.2,
      completeness: 0.1
    };
  }

  /**
   * Calculate weighted quality score with safety penalty adjustment
   * @param {Object} qualityMetrics - Quality assessment metrics object
   * @param {Object} safetyCheck - Safety validation result with severity level
   * @returns {Object} Computed quality scores (raw, adjusted, and per-metric)
   */
  calculate(qualityMetrics, safetyCheck) {
    const scores = {
      factual_accuracy: qualityMetrics.factually_correct ? 1 : 0.8,
      relevance: typeof qualityMetrics.relevance === 'number' 
        ? qualityMetrics.relevance 
        : 0.8,
      clarity: typeof qualityMetrics.clarity === 'number'
        ? qualityMetrics.clarity
        : 0.8,
      completeness: typeof qualityMetrics.completeness === 'number'
        ? qualityMetrics.completeness
        : 0.8
    };

    const weightedSum = Object.keys(scores).reduce((sum, key) => 
      sum + (scores[key] * this.weights[key]), 0
    );

    const severity = typeof safetyCheck.severity === 'number' 
      ? safetyCheck.severity 
      : 0;

    const adjustedScore = weightedSum * (1 - severity * 0.5);

    return {
      raw_score: weightedSum,
      adjusted_score: Math.max(0, Math.min(1, adjustedScore)),
      weighted_scores: scores
    };
  }
}
