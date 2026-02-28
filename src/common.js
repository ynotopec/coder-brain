class OpenAIInterface {
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.cache = new Map();
    this.explicitOffline = options.explicitOffline ?? process.env.OPENAI_OFFLINE === 'true';
  }

  _offlineCompletion(messages) {
    const last = messages[messages.length - 1]?.content || '';
    const extractQuoted = (label) => {
      const matcher = new RegExp(`${label}:\\s*"([\\s\\S]*?)"`);
      return last.match(matcher)?.[1]?.trim() || '';
    };

    const userInput =
      extractQuoted('User Input') ||
      extractQuoted('Query') ||
      extractQuoted('Context') ||
      '';

    const classifyIntent = (text) => {
      const normalized = text.toLowerCase();
      const hasAction = /(calc|calculate|compute|addition|add|sum|subtract|multiply|action|execute|run)/.test(normalized);
      const hasQuery = /(why|what|who|when|where|how|explain|search|retrieve|find|capital|query|rag)/.test(normalized);

      if (hasAction && hasQuery) return 'hybrid';
      if (hasAction) return 'action';
      if (hasQuery) return 'query';
      return 'chat';
    };

    if (last.includes('Normalize and parse the following user input')) {
      const intent = classifyIntent(userInput);
      const keywords = userInput
        .split(/\s+/)
        .map((word) => word.replace(/[^\p{L}\p{N}_-]+/gu, ''))
        .filter(Boolean)
        .slice(0, 8);

      return JSON.stringify({
        normalized_text: userInput,
        intent_type: intent,
        entities: [],
        keywords
      });
    }

    if (last.includes('Build context for answering the following user query')) {
      return JSON.stringify({
        context: userInput,
        relevant_memories: [],
        query_type: classifyIntent(userInput),
        retrieval_strategy: 'offline-fallback'
      });
    }

    if (last.includes('Can a smart LLM process this directly ?')) {
      return JSON.stringify({
        can_process_directly: false,
        direct_answer: '',
        confidence: 0.3
      });
    }

    if (last.includes('Classify the following query context')) {
      const intent = classifyIntent(userInput);
      return JSON.stringify({ intent, confidence: 0.75, reasoning: 'Offline keyword classification' });
    }

    if (last.includes("Plan an action to accomplish the user's goal")) {
      const numbers = Array.from(userInput.matchAll(/-?\d+(?:\.\d+)?/g), (m) => Number(m[0]));
      const operation = userInput.toLowerCase().includes('subtract') ? 'subtract'
        : userInput.toLowerCase().includes('multiply') ? 'multiply'
          : 'add';

      return JSON.stringify({
        tool_id: 'calc',
        tool_name: 'calculator',
        confidence: 0.8,
        parameters: { operation, a: numbers[0] ?? 0, b: numbers[1] ?? 0 },
        requires_human_approval: false,
        reasoning: 'Offline deterministic calculator plan'
      });
    }

    if (last.includes('Validate this tool call by simulating the dry run')) {
      return JSON.stringify({
        valid: true,
        warnings: [],
        estimated_impact: { changes_made: 0, risk_level: 'low' }
      });
    }

    if (last.includes('Check if this tool execution was high risk')) {
      return JSON.stringify({ is_high_risk: false, issues: [], rollback_required: false });
    }

    if (last.includes('Verify if this tool output is correct and expected')) {
      return JSON.stringify({ verify: true, issues: [], confidence: 0.8 });
    }

    if (last.includes('Perform a light safety check on this message')) {
      return JSON.stringify({
        needs_review: false,
        concern: 'none',
        confidence: 0.2,
        suggested_action: 'none'
      });
    }

    if (last.includes('Generate a direct, conversational reply to this user input')) {
      return JSON.stringify({
        message: `I received: "${userInput}". What would you like to do next?`,
        engagement_level: 'medium',
        topic_continuation: [],
        sentiment: 'neutral'
      });
    }

    if (last.includes('Answer this question using the provided context')) {
      return JSON.stringify({
        answer: `Offline answer for: ${userInput || 'your question'}`,
        sources: [],
        confidence: 0.6,
        has_information: true
      });
    }

    if (last.includes('Generate a helpful fallback message')) {
      return JSON.stringify({
        message: 'Je n’ai pas assez de contexte local pour répondre précisément.',
        suggestions: ['Reformulez la question', 'Ajoutez plus de détails'],
        sentiment: 'neutral'
      });
    }

    if (last.includes('Return JSON')) {
      return JSON.stringify({ normalized_text: userInput || last.slice(0, 80), intent: 'chat', confidence: 0.5 });
    }
    return 'I can help with that.';
  }

  _assertOnlineConfigured(operationName) {
    if (this.explicitOffline) {
      return;
    }

    if (!this.apiKey) {
      throw new Error(`[OpenAIInterface] ${operationName} requires OPENAI_API_KEY. Set OPENAI_OFFLINE=true to force offline mode.`);
    }
  }

  async generateCompletion(messages, model = 'gpt-4.1', temperature = 0.7, maxTokens = 500) {
    const cacheKey = JSON.stringify(messages) + model + temperature;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    if (this.explicitOffline) {
      const fallback = this._offlineCompletion(messages);
      this.cache.set(cacheKey, fallback);
      return fallback;
    }

    this._assertOnlineConfigured('generateCompletion');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens })
    });

    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(`OpenAI API Error: ${data.error?.message || response.statusText || 'Unknown completion failure'}`);
    }

    const result = data.choices[0]?.message?.content || '';
    if (!result) {
      throw new Error('OpenAI API Error: completion response did not include message content.');
    }

    this.cache.set(cacheKey, result);
    return result;
  }

  async embed(text, model = 'text-embedding-3-small', inputFormat = 'float') {
    if (this.explicitOffline) {
      return [1, ...Array(7).fill(0)];
    }

    this._assertOnlineConfigured('embed');

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model, input: [text], encoding_format: inputFormat })
    });

    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(`OpenAI API Error: ${data.error?.message || response.statusText || 'Unknown embedding failure'}`);
    }

    const embedding = data.data[0]?.embedding;
    if (!embedding) {
      throw new Error('OpenAI API Error: embedding response did not include vector data.');
    }

    return embedding;
  }

  clearCache() {
    this.cache.clear();
  }

  getCacheSize() {
    return this.cache.size;
  }
}

export { OpenAIInterface };
