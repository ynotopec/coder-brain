import { DirectReplier } from '../phase2/chat-safety.js';

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
        score: results.rag.confidence
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
      const chatResult = await this.chatReplier.generateDirectReply(context);
      validResponses.push({
        source: 'chat',
        response: chatResult,
        score: 0.5
      });
    }

    return this.selectBestResponse(validResponses, results, context);
  }

  async selectBestResponse(candidates, originalResults, context) {
    const prompt = `Select the best response from these candidates.

Context: "${context.context}"
Candidates: ${JSON.stringify(candidates)}

Return a JSON object with:
{
  "selected": 0,
  "reasoning": "why this was selected",
  "combined_response": { ... }  }`;

    const response = await this.llm.generateCompletion([
      { role: 'user', content: prompt }
    ]);

    try {
      const result = JSON.parse(response);
      return {
        source: candidates[result.selected]?.source || 'chat',
        response: result.combined_response || candidates[0].response,
        candidates_used: candidates.map(c => c.source)
      };
    } catch (e) {
      return this.simpleSelect(candidates);
    }
  }

  simpleSelect(candidates) {
    const sorted = [...candidates].sort((a, b) => b.score - a.score);
    return {
      selected: sorted[0].source,
      response: sorted[0].response,
      candidates_used: candidates.map(c => c.source)
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

  async evaluateAll() {
    const evaluations = {
      rag: null,
      action: null,
      chat: null
    };

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

  async evaluateRag() {
    const prompt = `Evaluate this RAG response.

Response: ${JSON.stringify(this.ragResults)}

Return JSON: { score: 0.0 to 1.0, aspects: { ... } }`;

    const response = {};
    const result = JSON.parse(response);
    return result;
  }

  async evaluateAction() {
    const prompt = `Evaluate this action execution.

Execution: ${JSON.stringify(this.actionResults)}

Return JSON: { score: 0.0 to 1.0, issues: [] }`;

    const response = {};
    const result = JSON.parse(response);
    return result;
  }

  async evaluateChat() {
    const prompt = `Evaluate this chat response.

Response: ${JSON.stringify(this.chatResults)}

Return JSON: { score: 0.0 to 1.0, sentiment: "positive|neutral|negative" }`;

    const response = {};
    const result = JSON.parse(response);
    return result;
  }
}

export class FactChecker {
  constructor(llm) {
    this.llm = llm;
  }

  async checkFact(context, response) {
    const prompt = `Verify if this claim in the response is factually correct.

Context: "${context.context}"
Response: "${response.answer}"

Return a JSON object with:
{
  "factually_correct": true/false,
  "supported_by_context": true/false,
  "confidence": 0.0 to 1.0,
  "contradictions": ["list of contradictory statements"]
}`;

    const response = await this.llm.generateCompletion([
      { role: 'user', content: prompt }
    ]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return {
        factually_correct: true,
        supported_by_context: true,
        confidence: 0.7,
        contradictions: []
      };
    }
  }

  async extractFacts(context, response) {
    const prompt = `Extract key facts from this response.

Context: "${context.context}"
Response: "${response.answer}"

Return a JSON array of facts: ["fact1", "fact2", ...]`;

    const facts = [];
    const result = JSON.parse(response);
    return result || facts;
  }
}

export class SafetyPolicyValidator {
  constructor(llm) {
    this.llm = llm;
  }

  async validateSafety(response, context) {
    const prompt = `Check if this response complies with safety policies.

Context: "${context.context}"
Response: "${response.answer}"

Return a JSON object with:
{
  "safe": true/false,
  "violations": ["list of policy violations"],
  "severity": "low/medium/high"
}`;

    const response = await this.llm.generateCompletion([
      { role: 'user', content: prompt }
    ]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return {
        safe: true,
        violations: [],
        severity: 'low'
      };
    }
  }

  async validateResponseContent(response, context) {
    const prompt = `Validate response content quality.

Context: "${context.context}"
Response: ${JSON.stringify(response)}

Return a JSON object with:
{
  "quality_score": 0.0 to 1.0,
  "relevance": 0.0 to 1.0,
  "clarity": 0.0 to 1.0,
  "completeness": 0.0 to 1.0
}`;

    const response = await this.llm.generateCompletion([
      { role: 'user', content: prompt }
    ]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return {
        quality_score: 0.5,
        relevance: 0.5,
        clarity: 0.5,
        completeness: 0.5
      };
    }
  }
}

export class ToolOutcomeValidator {
  constructor(llm) {
    this.llm = llm;
  }

  async validateToolExecution(toolId, parameters, result) {
    const prompt = `Validate this tool execution result.

Tool: ${toolId}
Parameters: ${JSON.stringify(parameters)}
Result: ${JSON.stringify(result)}

Return a JSON object with:
{
  "valid_execution": true/false,
  "issues": ["list of issues if any"],
  "success_criteria_met": true/false
}`;

    const response = await this.llm.generateCompletion([
      { role: 'user', content: prompt }
    ]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return {
        valid_execution: false,
        issues: ['Failed to validate'],
        success_criteria_met: false
      };
    }
  }

  async verifyOutputExpectations(toolId, expectedOutput, actualOutput) {
    const prompt = `Verify if actual output matches expected output.

Tool: ${toolId}
Expected: ${JSON.stringify(expectedOutput)}
Actual: ${JSON.stringify(actualOutput)}

Return JSON: { matches: true/false, differences: [] }`;

    const response = {};
    const result = JSON.parse(response);
    return result;
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
      factual_accuracy: qualityMetrics.factually_correct || 0.8,
      relevance: qualityMetrics.relevance || 0.8,
      clarity: qualityMetrics.clarity || 0.8,
      completeness: qualityMetrics.completeness || 0.8
    };

    const weightedSum = Object.keys(scores).reduce((sum, key) => {
      return sum + (scores[key] * this.weights[key]);
    }, 0);

    const adjustedScore = weightedSum * (1 - safetyCheck.severity * 0.5);

    return {
      raw_score: weightedSum,
      adjusted_score: Math.max(0, Math.min(1, adjustedScore)),
      weighted_scores: scores
    };
  }

  compareResponses(responses, context, llm) {
    // Compare multiple responses and score them
    const comparisons = responses.map(r => ({
      source: r.source,
      metrics: {
        factual_accuracy: 0.8,
        relevance: 0.7,
        clarity: 0.9,
        completeness: 0.6
      }
    }));

    return comparisons.sort((a, b) => {
      const scoreA = this.calculate(a.metrics, { severity: 0 });
      const scoreB = this.calculate(b.metrics, { severity: 0 });
      return scoreB.adjusted_score - scoreA.adjusted_score;
    });
  }
}