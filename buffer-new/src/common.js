class OpenAIInterface {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.cache = new Map();
  }

  async generateCompletion(messages, model = 'gpt-4.1', temperature = 0.7, maxTokens = 500) {
    const cacheKey = JSON.stringify(messages) + model + temperature;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens
        })
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(`OpenAI API Error: ${data.error.message}`);
      }

      const result = data.choices[0]?.message?.content || '';
      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      throw new Error(`Failed to call OpenAI API: ${error.message}`);
    }
  }

  async embed(text, model = 'text-embedding-3-small', inputFormat = 'text') {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model,
          input: [text],
          encoding_format: inputFormat
        })
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(`OpenAI API Error: ${data.error.message}`);
      }

      return data.data[0]?.embedding || [];
    } catch (error) {
      throw new Error(`Failed to call OpenAI API: ${error.message}`);
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