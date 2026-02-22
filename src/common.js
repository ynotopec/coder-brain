class OpenAIInterface {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.cache = new Map();
  }

  _offlineCompletion(messages) {
    const last = messages[messages.length - 1]?.content || '';
    if (last.includes('Return JSON')) {
      return JSON.stringify({ normalized_text: last.slice(0, 80), intent: 'chat', confidence: 0.5 });
    }
    return 'I can help with that.';
  }

  async generateCompletion(messages, model = 'gpt-4.1', temperature = 0.7, maxTokens = 500) {
    const cacheKey = JSON.stringify(messages) + model + temperature;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

    if (!this.apiKey) {
      const fallback = this._offlineCompletion(messages);
      this.cache.set(cacheKey, fallback);
      return fallback;
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens })
      });
      const data = await response.json();
      if (data.error) throw new Error(`OpenAI API Error: ${data.error.message}`);
      const result = data.choices[0]?.message?.content || '';
      this.cache.set(cacheKey, result);
      return result;
    } catch {
      return this._offlineCompletion(messages);
    }
  }

  async embed(text, model = 'text-embedding-3-small', inputFormat = 'text') {
    if (!this.apiKey) return [1, ...Array(7).fill(0)];

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model, input: [text], encoding_format: inputFormat })
      });
      const data = await response.json();
      if (data.error) throw new Error(`OpenAI API Error: ${data.error.message}`);
      return data.data[0]?.embedding || [1, ...Array(7).fill(0)];
    } catch {
      return [1, ...Array(7).fill(0)];
    }
  }

  clearCache() {
    this.cache.clear();
  }

  getCacheSize() {
    return this.cache.size;
  }
}

export { OpenAIInterface };
