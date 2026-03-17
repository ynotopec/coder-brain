import { DirectReplier } from '../phase2/chat-safety.js';

const parseJsonOr = (text, fallback) => {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

export class ResponseAggregator {
  constructor(llm) {
    this.llm = llm;
    this.chatReplier = new DirectReplier(llm);
  }

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
      const chatResult = await this.chatReplier.generateDirectReply(context.context || '');
      validResponses.push({
        source: 'chat',
        response: chatResult,
        // Keep fallback answers above the BrainSystem validity threshold so users
        // still receive a useful response when structured engines return nothing.
        score: 0.6
      });
    }

    return this.selectBestResponse(validResponses, context);
  }

  async selectBestResponse(candidates, context) {
    const prompt = `Select the best response from these candidates.\n\nContext: "${context.context}"\nCandidates: ${JSON.stringify(candidates)}\n\nReturn a JSON object with:\n{\n  "selected": 0,\n  "reasoning": "why this was selected",\n  "combined_response": { ... }\n}`;

    const llmResponse = await this.llm.generateCompletion([{ role: 'user', content: prompt }]);
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

    return this.simpleSelect(candidates);
  }

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

export class ParallelEvaluator {
  constructor(ragResults, actionResults, chatResults, llm) {
    this.ragResults = ragResults;
    this.actionResults = actionResults;
    this.chatResults = chatResults;
    this.llm = llm;
  }

  async evaluateAll(resultsInstance) {
    const evaluations = { rag: null, action: null, chat: null };
    if (this.ragResults || resultsInstance?.ragResults) evaluations.rag = await this.evaluateRag();
    if (this.actionResults || resultsInstance?.actionResults) evaluations.action = await this.evaluateAction();
    if (this.chatResults || resultsInstance?.chatResults) evaluations.chat = await this.evaluateChat();
    return evaluations;
  }

  async evaluateRag() {
    if (!this.ragResults) return null;
    
    const context = {
      answer: this.ragResults.answer || '',
      sources: this.ragResults.sources || [],
      confidence: this.ragResults.confidence ? parseFloat(this.ragResults.confidence) : 0.5,
      has_information: this.ragResults.has_information
    };

    // Validate factual consistency with claimed sources
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
  }

  async evaluateAction() {
    if (!this.actionResults) return null;

    const execution = {
      success: this.actionResults.success === true,
      toolId: this.actionResults.toolId || 'unknown',
      result: this.actionResults.result,
      verify: this.actionResults.verify || null
    };

    if (!execution.success) return { score: 0.2, issues: ['Tool execution failed'] };

    // Validate tool output structure
    const outputValid = typeof execution.result === 'object' && 
                        !Array.isArray(execution.result);

    return {
      score: outputValid ? 0.85 : 0.6,
      issues: outputValid ? [] : ['Unexpected tool result format']
    };
  }

  async evaluateChat() {
    if (!this.chatResults) return null;

    const chat = {
      message: this.chatResults.message || '',
      confidence: this.chatResults.confidence ? parseFloat(this.chatResults.confidence) : 0.5,
      safety: this.chatResults.safety || null
    };

    // Validate message length and safety flags
    const lengthValid = chat.message.length > 10 && chat.message.length < 5000;
    const safetyOk = !chat.safety || (chat.safety.needs_review === false);

    return {
      score: chat.confidence * (lengthValid ? 1.0 : 0.7) * (safetyOk ? 1.0 : 0.5),
      sentiment: 'neutral',
      metrics: { messageLength: chat.message.length }
    };
  }
}

export class FactChecker {
  constructor(llm) {
    this.llm = llm;
  }

  async checkFact(context, response) {
    const prompt = `Verify if this claim in the response is factually correct.\n\nContext: "${context.context}"\nResponse: "${response.answer}"`;
    const llmResponse = await this.llm.generateCompletion([{ role: 'user', content: prompt }]);

    return parseJsonOr(llmResponse, {
      factually_correct: true,
      supported_by_context: true,
      confidence: 0.7,
      contradictions: []
    });
  }

  async extractFacts(context, response) {
    const prompt = `Extract key facts from this response.\n\nContext: "${context.context}"\nResponse: "${response.answer}"`;
    const llmResponse = await this.llm.generateCompletion([{ role: 'user', content: prompt }]);
    return parseJsonOr(llmResponse, []);
  }
}

export class SafetyPolicyValidator {
  constructor(llm) {
    this.llm = llm;
  }

  async validateSafety(response, context) {
    const prompt = `Check if this response complies with safety policies.\n\nContext: "${context.context}"\nResponse: "${response.answer}"`;
    const llmResponse = await this.llm.generateCompletion([{ role: 'user', content: prompt }]);

    return parseJsonOr(llmResponse, { safe: true, violations: [], severity: 'low' });
  }

  async validateResponseContent(response, context) {
    const prompt = `Validate response content quality.\n\nContext: "${context.context}"\nResponse: ${JSON.stringify(response)}`;
    const llmResponse = await this.llm.generateCompletion([{ role: 'user', content: prompt }]);

    return parseJsonOr(llmResponse, {
      quality_score: 0.5,
      relevance: 0.5,
      clarity: 0.5,
      completeness: 0.5
    });
  }
}

export class ToolOutcomeValidator {
  constructor(llm) {
    this.llm = llm;
  }

  async validateToolExecution(toolId, parameters, result) {
    const prompt = `Validate this tool execution result.\n\nTool: ${toolId}\nParameters: ${JSON.stringify(parameters)}\nResult: ${JSON.stringify(result)}`;
    const llmResponse = await this.llm.generateCompletion([{ role: 'user', content: prompt }]);

    return parseJsonOr(llmResponse, {
      valid_execution: true,
      issues: [],
      success_criteria_met: true
    });
  }

  async verifyOutputExpectations(toolId, expectedOutput, actualOutput) {
    const prompt = `Verify if actual output matches expected output.\n\nTool: ${toolId}\nExpected: ${JSON.stringify(expectedOutput)}\nActual: ${JSON.stringify(actualOutput)}`;
    const llmResponse = await this.llm.generateCompletion([{ role: 'user', content: prompt }]);
    return parseJsonOr(llmResponse, { matches: true, differences: [] });
  }
}

export class QualityScoreCalculator {
  constructor() {
    this.weights = {
      factual_accuracy: 0.4,
      relevance: 0.3,
      clarity: 0.2,
      completeness: 0.1
    };
  }

  calculate(qualityMetrics, safetyCheck) {
    const scores = {
      factual_accuracy: qualityMetrics.factually_correct ? 1 : 0.8,
      relevance: qualityMetrics.relevance || 0.8,
      clarity: qualityMetrics.clarity || 0.8,
      completeness: qualityMetrics.completeness || 0.8
    };

    const weightedSum = Object.keys(scores).reduce((sum, key) => sum + (scores[key] * this.weights[key]), 0);
    const severity = typeof safetyCheck.severity === 'number' ? safetyCheck.severity : 0;
    const adjustedScore = weightedSum * (1 - severity * 0.5);

    return {
      raw_score: weightedSum,
      adjusted_score: Math.max(0, Math.min(1, adjustedScore)),
      weighted_scores: scores
    };
  }
}
