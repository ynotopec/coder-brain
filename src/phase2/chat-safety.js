import { OpenAIInterface } from '../common.js';

const parseJsonObject = (text) => {
  if (typeof text !== 'string') {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
    if (fenced && fenced[1]) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        return null;
      }
    }

    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (!objectMatch) {
      return null;
    }

    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      return null;
    }
  }
};

const detectFrench = (input) => /\b(quel|comment|pourquoi|bonjour|salut|merci|est|ton|ta|vous|tu|nom)\b/i.test(input);

const buildLocalChatReply = (input) => {
  const safeInput = String(input || '').trim();
  const isFrench = detectFrench(safeInput);

  if (/\b(quel est ton nom|ton nom|tu t['’]appelles comment|who are you|what('?s| is) your name)\b/i.test(safeInput)) {
    return {
      message: isFrench ? 'Je m\'appelle Coder Brain.' : 'My name is Coder Brain.',
      engagement_level: 'medium',
      topic_continuation: isFrench ? ['présentation'] : ['introduction'],
      sentiment: 'positive'
    };
  }

  return {
    message: isFrench
      ? `J'ai bien reçu : "${safeInput}". Que veux-tu faire ensuite ?`
      : `I received: "${safeInput}". What would you like to do next?`,
    engagement_level: 'medium',
    topic_continuation: isFrench ? ['aide', 'objectif'] : ['help', 'goal'],
    sentiment: 'positive'
  };
};

export class DirectReplier {
  constructor(llm) {
    this.llm = llm;
  }

  async generateDirectReply(context) {
    const prompt = `Generate a direct, conversational reply to this user input.
Answer in the same language as the user.

User Input: "${context.context}"
Intent: ${context.query_type}

Return a JSON object with:
{
  "message": "natural conversation response",
  "engagement_level": "high/medium/low",
  "topic_continuation": ["topics to continue with"],
  "sentiment": "positive/neutral/negative"
}`;

    const response = await this.llm.generateCompletion([{ role: 'user', content: prompt }]);
    const parsed = parseJsonObject(response);

    if (parsed?.message) {
      return parsed;
    }

    const repairPrompt = `You must return only valid JSON with no markdown and no extra text.
Use the same language as the user.

User input: "${context.context}"

Return exactly:
{
  "message": "natural conversation response",
  "engagement_level": "high/medium/low",
  "topic_continuation": ["topics to continue with"],
  "sentiment": "positive/neutral/negative"
}`;

    const repairResponse = await this.llm.generateCompletion([{ role: 'user', content: repairPrompt }]);
    const repaired = parseJsonObject(repairResponse);

    if (repaired?.message) {
      return repaired;
    }

    return buildLocalChatReply(context.context);
  }

  async generateChatResponse(input) {
    return this.generateDirectReply({
      context: input,
      query_type: 'chat'
    });
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

    const response = await this.llm.generateCompletion([{ role: 'user', content: prompt }]);
    const parsed = parseJsonObject(response);

    if (parsed && typeof parsed.needs_review === 'boolean') {
      return parsed;
    }

    return {
      needs_review: false,
      concern: 'none',
      confidence: 0.2,
      suggested_action: 'none'
    };
  }

  async generateChatResponse(input) {
    const directReplier = new DirectReplier(this.llm);
    const reply = await directReplier.generateChatResponse(input);
    return reply.message || String(reply);
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
    this.finalResponses = [];
    this.retries = [];
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
