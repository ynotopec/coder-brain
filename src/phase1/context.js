import { parseJsonObject } from '../common.js';

/**
 * Sanitization utility for preventing LLM injection attacks
 */
export function sanitizeInput(userInput) {
  if (typeof userInput !== 'string') {
    return String(userInput || '');
  }

  let sanitized = userInput;

  // Remove HTML/script tags
  sanitized = sanitized.replace(/<script[^>]*>.*?<\/script>/gi, '');
  sanitized = sanitized.replace(/<[\w\s="':>]+/g, '');

  // Escape potentially dangerous quote patterns
  sanitized = sanitized.replaceAll('""', '"');

  // Limit length and strip control characters
  sanitized = sanitized.slice(0, 5000).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ');

  return sanitized.trim();
}


/**
 * ContextBuilder - constructs query context with memory retrieval
 */
export class ContextBuilder {
  /**
   * Create a context builder for query processing
   * @param {OpenAIInterface} llm - OpenAI interface for query normalization
   * @param {VectorStore} vectorStore - Vector store for embedding and search
   * @param {LongTermMemory} longTermMemory - Memory storage instance
   */
  constructor(llm, vectorStore, longTermMemory) {
    this.llm = llm;
    this.vectorStore = vectorStore;
    this.longTermMemory = longTermMemory;
  }

  /**
   * Normalize and parse user input with sanitization
   * @param {string} input - Raw user input (max 5000 chars)
   * @returns {Promise<Object>} Normalized input result
   */
  async normalizeInput(input) {
    const sanitizedInput = sanitizeInput(input);

    const prompt = `Normalize and parse the following user input. Return a JSON object with these fields:
{
  "normalized_text": "Normalized version of the input",
  "intent_type": "one of: chat, query, action, hybrid",
  "entities": ["extracted entities as array"],
  "keywords": ["extracted keywords as array"]
}

User Input: "${sanitizedInput}"`;

    try {
      const response = await this.llm.generateCompletion([{ role: 'user', content: prompt }]);
      const parsed = parseJsonObject(response);
      if (!parsed) {
        throw new Error('Failed to parse normalization response as JSON');
      }
      return parsed;
    } catch (e) {
      console.error('[ContextBuilder] Normalization failed:', e.message);
      return {
        normalized_text: sanitizedInput,
        intent_type: 'chat',
        entities: [],
        keywords: []
      };
    }
  }

  /**
   * Build context from normalized input with memory retrieval
   * @param {Object} normalizedInput - Normalized input object
   * @returns {Promise<Object>} Context object
   */
  async buildContext(normalizedInput) {
    try {
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
      const parsed = parseJsonObject(response);
      if (!parsed) {
        throw new Error('Failed to parse context response as JSON');
      }
      return parsed;
    } catch (e) {
      console.error('[ContextBuilder] Context building failed:', e.message);
      return {
        context: normalizedInput.normalized_text,
        relevant_memories: [],
        query_type: 'general',
        retrieval_strategy: 'fallback'
      };
    }
  }
}

/**
 * IntentRouter - routes queries to appropriate processing pipelines
 */
export class IntentRouter {
  /**
   * Create an intent router for query classification
   * @param {OpenAIInterface} llm - OpenAI interface for intent detection
   */
  constructor(llm) {
    this.llm = llm;
  }

  /**
   * Route query to appropriate handler based on context
   * @param {Object} context - Query context object
   * @returns {Promise<Object>} Routing decision with intent and confidence
   */
  async route(context) {
    const prompt = `Classify the following query context. Return a JSON object with these fields:

{
  "intent": "one of: query, action, hybrid, chat",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation"
}

Context: "${context.context}"
Query Type: ${context.query_type || 'general'}
Entities: ${JSON.stringify(context.entities || [])}

Return ONLY the JSON object.`;

    try {
      const response = await this.llm.generateCompletion([{ role: 'user', content: prompt }]);
      const result = parseJsonObject(response);
      if (!result) {
        throw new Error('Failed to parse intent classification response as JSON');
      }
      return {
        intent: result.intent,
        confidence: result.confidence || 0.5,
        reasoning: result.reasoning
      };
    } catch (e) {
      console.error('[IntentRouter] Classification failed:', e.message);
      return {
        intent: 'chat',
        confidence: 0.5,
        reasoning: 'Default to chat due to parsing error'
      };
    }
  }
}

/**
 * LongTermMemory - manages persistent knowledge storage in vector store
 */
export class LongTermMemory {
  /**
   * Create a long-term memory system backed by vector store
   * @param {VectorStore} vectorStore - Vector store for embeddings
   */
  constructor(vectorStore) {
    this.vectorStore = vectorStore;
  }

  /**
   * Retrieve relevant content from memory based on query
   * @param {string} query - User query to search for
   * @returns {Promise<Array>} Matching results
   */
  async retrieve(query) {
    try {
      const embedding = await this.vectorStore.embed(query);
      const results = await this.vectorStore.search(embedding, 5);
      return results;
    } catch (error) {
      if (/model .* not found/i.test(error.message)) {
        console.warn('[LongTermMemory] Retrieval skipped: embedding model unavailable. Set LLM_EMBED_MODEL/OLLAMA_EMBED_MODEL to a valid embedding model.');
      } else {
        console.error('[LongTermMemory] Retrieval failed:', error.message);
      }
      return [];
    }
  }

  /**
   * Save new content to memory with optional metadata
   * @param {string} content - Content to save
   * @param {Object} metadata - Optional metadata object
   * @returns {{status: string, id: string}} Save result
   */
  async save(content, metadata = {}) {
    try {
      await this.vectorStore.add(content, metadata);
      return { status: 'saved', id: metadata.id || null };
    } catch (error) {
      console.error('[LongTermMemory] Save failed:', error.message);
      return { status: 'failed', id: null };
    }
  }
}
