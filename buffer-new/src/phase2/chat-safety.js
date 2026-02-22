import { OpenAIInterface } from '../common.js';

export class DirectReplier {
  constructor(llm) {
    this.llm = llm;
  }

  async generateDirectReply(context) {
    const prompt = `Generate a direct, conversational reply to this user input.

User Input: "${context.context}"
Intent: ${context.query_type}

Return a JSON object with:
{
  "message": "natural conversation response",
  "engagement_level": "high/medium/low",
  "topic_continuation": ["topics to continue with"],
  "sentiment": "positive/neutral/negative"
}`;

    const response = await this.llm.generateCompletion([
      { role: 'user', content: prompt }
    ]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return {
        message: `I understand you said "${context.context}". How else can I help?`,
        engagement_level: 'medium',
        topic_continuation: [],
        sentiment: 'positive'
      };
    }
  }

  async generateChatResponse(input) {
    return {
      message: `Thanks for sharing "${input}". What else is on your mind?`,
      engagement_level: 'medium',
      topic_continuation: ['ask about interests', 'offer help'],
      sentiment: 'positive'
    };
  }
}

export class SafetyChecker {
  constructor(llm, observabilityLog) {
    this.llm = llm;
    this.observabilityLog = observabilityLog;
  }

  async checkLightSafety(context) {
    const prompt = `Perform a light safety check on this message.

User Input: "${context.context}"
Context: ${JSON.stringify(context.entities)}

Return a JSON object with:
{
  "needs_review": true/false,
  "concern": "category of concern if any (violence, hate_speech, sexual_content, harassment, other)",
  "confidence": 0.0 to 1.0,
  "suggested_action": "warn, block, ignore, or none"
}`;

    const response = await this.llm.generateCompletion([
      { role: 'user', content: prompt }
    ]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return {
        needs_review: true,
        concern: 'other',
        confidence: 0.3,
        suggested_action: 'warn'
      };
    }
  }

  async recordSafetyCheck(input, result) {
    const entry = {
      timestamp: new Date().toISOString(),
      input: input,
      check: {
        needs_review: result.needs_review,
        concern: result.concern,
        confidence: result.confidence
      }
    };

    if (this.observabilityLog) {
      this.observabilityLog.safetyChecks.push(entry);
    }

    return entry;
  }
}

export class PolicyValidator {
  constructor(llm) {
    this.llm = llm;
  }

  async validate(context) {
    const prompt = `Check if this violates any content policies.

Context: "${context.context}"
Entities: ${JSON.stringify(context.entities)}
Query Type: ${context.query_type}

Return a JSON object with:
{
  "policy_violation": true/false,
  "violations": ["list of violations"],
  "severity": "low/medium/high"
}`;

    const response = await this.llm.generateCompletion([
      { role: 'user', content: prompt }
    ]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return {
        policy_violation: false,
        violations: [],
        severity: 'low'
      };
    }
  }
}

export class ResponseFilter {
  constructor(llm) {
    this.llm = llm;
  }

  async filterResponse(message, context) {
    const prompt = `Check if this response is appropriate for the context.

Context: "${context.context}"
Response: "${message}"

Return a JSON object with:
{
  "appropriate": true/false,
  "issues": ["list of issues if any"],
  "rating": 1.0 to 5.0
}`;

    const response = await this.llm.generateCompletion([
      { role: 'user', content: prompt }
    ]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return {
        appropriate: true,
        issues: [],
        rating: 3.0
      };
    }
  }
}

export class ObservabilityLog {
  constructor() {
    this.safetyChecks = [];
    this.policyValidations = [];
    this.responseFilters = [];
    this.errors = [];
    this.debugData = new Map();
  }

  reset() {
    this.safetyChecks = [];
    this.policyValidations = [];
    this.responseFilters = [];
    this.errors = [];
  }

  logError(stage, error) {
    this.errors.push({
      timestamp: new Date().toISOString(),
      stage,
      error
    });
  }

  logDebug(stage, data) {
    this.debugData.set(stage, data);
  }

  getStats() {
    return {
      safetyCheckCount: this.safetyChecks.length,
      policyValidationCount: this.policyValidations.length,
      responseFilterCount: this.responseFilters.length,
      errorCount: this.errors.length,
      debugData: Array.from(this.debugData.entries())
    };
  }
}