import OpenAI from 'openai';

class OpenAIInterface {
  constructor(apiKey) {
    this.openai = new OpenAI({ apiKey });
  }

  async generateCompletion(messages, model = 'gpt-4.1', temperature = 0.7, maxTokens = 500) {
    const response = await this.openai.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    });
    return response.choices[0].message.content;
  }

  async embed(text, model = 'text-embedding-3-small', inputFormat = 'text') {
    const response = await this.openai.embeddings.create({
      model,
      input: [text],
    });
    return response.data[0].embedding;
  }
}

export class ContextBuilder {
  constructor(llm, vectorStore, longTermMemory) {
    this.llm = llm;
    this.vectorStore = vectorStore;
    this.longTermMemory = longTermMemory;
  }

  async normalizeInput(input) {
    const prompt = `Normalize and parse the following user input. Return a JSON object with these fields:
{
  "normalized_text": "Normalized version of the input",
  "intent_type": "one of: chat, query, action, hybrid",
  "entities": ["extracted entities as array"],
  "keywords": ["extracted keywords as array"]
}

User Input: "${input}"`;

    const response = await this.llm.generateCompletion([{ role: 'user', content: prompt }]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return {
        normalized_text: input,
        intent_type: 'chat',
        entities: [],
        keywords: []
      };
    }
  }

  async buildContext(normalizedInput) {
    const memoryRetrieval = await this.longTermMemory.retrieve(normalizedInput.normalized_text);
    const similarContent = memoryRetrieval.length > 0 ? memoryRetrieval[0].content : undefined;

    const contextPrompt = `Build context for answering the following user query.

User Input: "${normalizedInput.normalized_text}"
Entities: ${JSON.stringify(normalizedInput.entities)}
Keywords: ${JSON.stringify(normalizedInput.keywords)}
Similar Past Context: "${similarContent || 'No similar context found'}"

Return a JSON object with:
{
  "context": "Detailed context for answering",
  "relevant_memories": ["related memories from long-term memory"],
  "query_type": "what type of query is this",
  "retrieval_strategy": "what strategy should be used for retrieval"
}`;

    const response = await this.llm.generateCompletion([{ role: 'user', content: contextPrompt }]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return {
        context: normalizedInput.normalized_text,
        relevant_memories: [],
        query_type: 'general',
        retrieval_strategy: 'fallback'
      };
    }
  }
}

export class IntentRouter {
  constructor(llm) {
    this.llm = llm;
  }

  async route(context) {
    const prompt = `Classify the following query context. Return a JSON object with these fields:

{
  "intent": "one of: query, action, hybrid, chat",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation"
}

Context: "${context.context}"
Query Type: ${context.query_type}
Entities: ${JSON.stringify(context.entities)}

Return ONLY the JSON object.`;

    const response = await this.llm.generateCompletion([{ role: 'user', content: prompt }]);

    try {
      const result = JSON.parse(response);
      return {
        intent: result.intent,
        confidence: result.confidence,
        reasoning: result.reasoning
      };
    } catch (e) {
      return {
        intent: 'chat',
        confidence: 0.5,
        reasoning: 'Default to chat due to parsing error'
      };
    }
  }
}

export class LongTermMemory {
  constructor(vectorStore) {
    this.vectorStore = vectorStore;
  }

  async retrieve(query) {
    const embedding = await this.vectorStore.embed(query);
    const results = await this.vectorStore.search(embedding, topK = 5);
    return results;
  }

  async save(content, metadata = {}) {
    await this.vectorStore.add(content, metadata);
    return { status: 'saved', id: metadata.id };
  }
}