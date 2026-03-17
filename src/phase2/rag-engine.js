import { parseJsonObject } from '../common.js';

/**
 * RAG Engine Module - Retrieval Augmented Generation components
 */
/**
 * Sanitized content storage to prevent injection attacks
 * @param {string} text - Input string to sanitize
 * @returns {string} Sanitized text
 */
function sanitizeContent(text) {
  const sanitized = String(text || '');
  return sanitized.slice(0, 5000).replace(/[\x00-\x1F]/g, ' ').trim();
}

/**
 * VectorStore - manages embeddings and similarity search
 */
export class VectorStore {
  /**
   * Create a vector store with embedding caching
   * @param {OpenAIInterface} llm - OpenAI interface for embedding generation
   */
  constructor(llm) {
    this.embeddings = new Map(); // content -> embedding vector
    this.documentIndex = []; // ordered array of document metadata
    this.llm = llm;
  }

  /**
   * Generate embedding for text with caching to reduce API calls
   * @param {string} text - Text to embed (max 5000 chars)
   * @param {string} model - Embedding model identifier
   * @returns {Promise<Array>} Embedding vector
   */
  async embed(text, model = this.llm?.defaultEmbeddingModel || 'text-embedding-3-small') {
    const cacheKey = `${model}:${sanitizeContent(text)}`;
    
    // Check cache first - returns cached embedding if available
    if (this.embeddings.has(cacheKey)) {
      return this.embeddings.get(cacheKey);
    }

    const embedding = await this.llm.embed(text, model);
    this.embeddings.set(cacheKey, embedding);
    
    return embedding;
  }

  /**
   * Linear O(n) similarity search through all stored documents
   * Note: For production with large datasets (>10k docs), consider ANN libraries
   * @param {Array} embedding - Query embedding vector to match against
   * @param {number} topK - Maximum number of results to return
   * @returns {Promise<Array>} Top-K matching documents by similarity
   */
  async search(embedding, topK = 5) {
    const candidates = [];
    
    for (let i = 0; i < this.documentIndex.length; i++) {
      const docId = this.documentIndex[i].id;
      const docEmbedding = this.embeddings.get(docId);
      
      if (docEmbedding) {
        const similarity = this.cosineSimilarity(embedding, docEmbedding);
        
        if (similarity >= 0) {
          candidates.push({
            id: docId,
            document: this.documentIndex[i].document,
            similarity
          });
        }
      }
    }
    
    return candidates
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  /**
   * Add new document to the vector store with embedding caching
   * @param {string} content - Document content (max 5000 chars)
   * @param {Object} metadata - Document metadata object
   * @returns {{id: string, embedding: Array}} Addition result with doc ID and embedding
   */
  async add(content, metadata = {}) {
    const sanitizedContent = sanitizeContent(content);
    
    const embedding = await this.embed(sanitizedContent);
    const id = metadata.id || `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    this.documentIndex.push({
      id,
      document: sanitizedContent,
      metadata
    });
    
    this.embeddings.set(id, embedding);
    
    return { id, embedding };
  }

  /**
   * Calculate cosine similarity between two vectors
   * @param {Array} vecA - First vector array
   * @param {Array} vecB - Second vector array
   * @returns {number} Cosine similarity (0-1 range for non-negative vectors)
   */
  cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      magnitudeA += vecA[i] * vecA[i];
      magnitudeB += vecB[i] * vecB[i];
    }

    if (magnitudeA === 0 || magnitudeB === 0) return 0;

    return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
  }
}

/**
 * QueryPlanner - determines optimal retrieval strategy for queries
 */
export class QueryPlanner {
  /**
   * Query planning with fallback to linear search
   * @param {OpenAIInterface} llm - OpenAI interface
   * @param {VectorStore} vectorStore - Vector store instance for context retrieval
   */
  constructor(llm, vectorStore) {
    this.llm = llm;
    this.vectorStore = vectorStore;
  }

  /**
   * Plan optimal approach for answering a query based on context analysis
   * @param {Object} context - Query context with query_type and entities
   * @param {Object} options - Additional parameters to override defaults
   * @returns {Promise<Object>} Planning result with approach, confidence, and parameters
   */
  async plan(context, options = {}) {
    const { queryType = context.query_type, entities = context.entities } = options;

    try {
      const response = await this.llm.generateCompletion([{
        role: 'user',
        content: `Plan the best approach for answering this query.

Query: "${context.context || 'No query provided'}"
Entity: ${JSON.stringify(entities)}
Query Type: ${queryType}

Return a JSON object with:
{
  "approach": "rag, action, direct, or fallback",
  "confidence": number between 0 and 1,
  "parameters": {
    "top_k": number of documents to retrieve,
    "search_filters": ["filters if any"],
    "retrieval_strategy": "what method to use"
  },
  "reasoning": "brief explanation"
}`,
        stream: false
      }]);

      const result = JSON.parse(response);

      return {
        approach: result.approach || 'fallback',
        confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
        parameters: result.parameters || {}
      };
    } catch (error) {
      console.error('[QueryPlanner Error]', error.message);
      return {
        approach: 'fallback',
        confidence: 0.3,
        parameters: { top_k: 5, retrieval_strategy: 'simple' }
      };
    }
  }
}

/**
 * Reranker - post-processes search results for better relevance ranking
 */
export class Reranker {
  /**
   * Re-rank initial search results using LLM-based relevance scoring
   * @param {OpenAIInterface} llm - OpenAI interface for reranking decisions
   */
  constructor(llm) {
    this.llm = llm;
  }

  /**
   * Re-rank search results based on query relevance using LLM
   * @param {Array} results - Initial search results array
   * @param {string|Array} query - Query text or array of keywords
   * @returns {Promise<Array>} Re-ordered results by relevance
   */
  async rerank(results, query) {
    if (!results || results.length === 0) return [];

    const queryText = Array.isArray(query) ? query.join(' ') : String(query);
    
    try {
      const content = results.map((r, index) =>
        `Result ${index + 1}: ${String(r.document || r.content).substring(0, 500)}`
      ).join('\n');

      const response = await this.llm.generateCompletion([{
        role: 'user',
        content: `Rank these search results by relevance to the query.

Query: "${queryText.substring(0, 200)}"

Results:
${content}

Return ONLY a JSON object with reordered indices (0-based):
{
  "reordered": [0, 2, 1] // indices in order of relevance
}`,
        stream: false
      }]);

      const result = JSON.parse(response);
      
      if (result.reordered && Array.isArray(result.reordered)) {
        const reordered = [];
        for (const index of result.reordered) {
          if (typeof index === 'number' && index >= 0 && index < results.length) {
            reordered.push(results[index]);
          }
        }
        return reordered;
      }
      
      return results;
    } catch (error) {
      console.error('[Reranker Error]', error.message);
      return results;
    }
  }
}

/**
 * AnswerGenerator - produces answers from retrieved context
 */
export class AnswerGenerator {
  /**
   * Generate contextual answers based on RAG retrieval results
   * @param {OpenAIInterface} llm - OpenAI interface for answer generation
   */
  constructor(llm) {
    this.llm = llm;
  }

  /**
   * Generate an answer from retrieved context and user question
   * @param {Array} results - Top-K search results context
   * @param {string} question - User's question or query
   * @returns {Promise<Object>} Answer with sources, confidence, and information availability
   */
  async generate(results, question) {
    const contextText = results.length > 0
      ? results.map((r, i) => `Reference ${i + 1}: ${String(r.document || r.content).substring(0, 300)}`).join('\n')
      : '';

    try {
      const response = await this.llm.generateCompletion([{
        role: 'user',
        content: `Answer this question using the provided context. If information is not in the context, indicate that clearly.

Question: "${question.substring(0, 300)}"

${contextText ? `Context:\n${contextText}` : '[No relevant context found]'}

Return a valid JSON response:
{
  "answer": string,
  "sources": ["source indices from results array"],
  "confidence": number between 0 and 1,
  "has_information": boolean
}`,
        stream: false
      }]);

      const parsed = parseJsonObject(response);
      if (!parsed) {
        throw new Error('Invalid JSON from answer generation response');
      }
      
      return {
        answer: parsed.answer || 'I could not generate a response',
        sources: parsed.sources || [],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.0,
        has_information: parsed.has_information !== undefined 
          ? parsed.has_information 
          : false
      };
    } catch (error) {
      console.error('[AnswerGenerator Error]', error.message);
      return {
        answer: 'I apologize, but I could not generate a proper response.',
        sources: [],
        confidence: 0.0,
        has_information: false
      };
    }
  }

  /**
   * Generate fallback message when no relevant information found
   * @param {string} query - User's unanswerable query
   * @returns {Promise<Object>} Fallback response with suggestions
   */
  async fallbackMessage(query) {
    try {
      const response = await this.llm.generateCompletion([{
        role: 'user',
        content: `Generate a helpful response when unable to answer.

Query: "${query.substring(0, 200)}"

Return JSON:
{
  "message": string,
  "suggestions": ["alternative suggestions", "related topics"],
  "sentiment": "positive or neutral"
}`,
        stream: false
      }]);

      const parsed = parseJsonObject(response);
      if (!parsed) {
        throw new Error('Invalid JSON from fallback response');
      }
      
      return {
        message: parsed.message || 'I apologize, but I couldn\'t process your request right now.',
        suggestions: parsed.suggestions || ['Try rephrasing', 'Contact support'],
        sentiment: parsed.sentiment || 'neutral'
      };
    } catch (error) {
      console.error('[AnswerGenerator Fallback Error]', error.message);
      return {
        message: 'I\'m sorry, but I could not process your request right now.',
        suggestions: ['Try rephrasing', 'Contact support'],
        sentiment: 'neutral'
      };
    }
  }
}
