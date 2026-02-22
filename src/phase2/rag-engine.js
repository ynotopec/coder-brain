import { OpenAIInterface } from '../common.js';

export class VectorStore {
  constructor() {
    this.embeddings = new Map();
    this.documents = [];
  }

  async embed(text, model = 'text-embedding-3-small') {
    const llm = new OpenAIInterface(process.env.OPENAI_API_KEY);
    return await llm.embed(text, model);
  }

  async search(embedding, topK = 5) {
    const results = [];

    for (const doc of this.documents) {
      const docEmbedding = this.embeddings.get(doc.id);
      if (docEmbedding) {
        const similarity = this.cosineSimilarity(embedding, docEmbedding);
        if (similarity > 0) {
          results.push({
            ...doc,
            similarity,
            score: similarity
          });
        }
      }
    }

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  async add(content, metadata = {}) {
    const embedding = await this.embed(content);
    const id = metadata.id || Date.now().toString();

    this.documents.push({
      id,
      content,
      metadata,
      createdAt: new Date().toISOString()
    });

    this.embeddings.set(id, embedding);
    return { id, embedding };
  }

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

export class QueryPlanner {
  constructor(llm, vectorStore) {
    this.llm = llm;
    this.vectorStore = vectorStore;
  }

  async plan(context, options = {}) {
    const { queryType = context.query_type, entities = context.entities } = options;

    const prompt = `Plan the best approach for answering this query.

Query: "${context.context}"
Entity: ${JSON.stringify(entities)}
Query Type: ${queryType}

Return a JSON object with:
{
  "approach": "rag, action, direct, or fallback",
  "confidence": 0.0 to 1.0,
  "parameters": {
    "top_k": number of documents to retrieve,
    "search_filters": ["filters if any"],
    "retrieval_strategy": "what method to use"
  },
  "reasoning": "brief explanation"
}`;

    const response = await this.llm.generateCompletion([{ role: 'user', content: prompt }]);

    try {
      const result = JSON.parse(response);
      return {
        approach: result.parameters?.approach || 'fallback',
        confidence: result.confidence || 0.5,
        parameters: result.parameters || {}
      };
    } catch (e) {
      return {
        approach: 'fallback',
        confidence: 0.3,
        parameters: {}
      };
    }
  }
}

export class Reranker {
  constructor(llm) {
    this.llm = llm;
  }

  async rerank(results, query) {
    if (results.length === 0) return results;

    const queryText = Array.isArray(query) ? query.join(' ') : query;

    const content = results.map((r, index) =>
      `Result ${index + 1}: ${r.content}`
    ).join('\n');

    const prompt = `Rank these search results by relevance to the query.

Query: "${queryText}"

Results:
${content}

Return a JSON object with:
{
  "reordered": [indices of results in order of relevance]
}`;

    const response = await this.llm.generateCompletion([{ role: 'user', content: prompt }]);

    try {
      const result = JSON.parse(response);
      const reordered = [];

      result.reordered.forEach(index => {
        if (results[index]) {
          reordered.push(results[index]);
        }
      });

      return reordered.length > 0 ? reordered : results;
    } catch (e) {
      return results;
    }
  }
}

export class AnswerGenerator {
  constructor(llm) {
    this.llm = llm;
  }

  async generate(results, question) {
    let contextText = '';

    if (results.length > 0) {
      contextText = results.map((r, i) => `Reference ${i + 1}: ${r.content}`).join('\n');
    }

    const prompt = `Answer this question using the provided context. If the information is not in the context, say "I don't have enough information."

Question: "${question}"

${contextText ? `Context:\n${contextText}\n\n` : ''}

Return a valid JSON response with:
{
  "answer": "Your answer to the question",
  "sources": ["list of source indices"],
  "confidence": 0.0 to 1.0,
  "has_information": true/false
}`;

    const response = await this.llm.generateCompletion([{ role: 'user', content: prompt }]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return {
        answer: 'I apologize, but I could not generate a proper response.',
        sources: [],
        confidence: 0.0,
        has_information: false
      };
    }
  }

  async fallbackMessage(query) {
    const prompt = `Generate a helpful fallback message for when we cannot answer a user's query.

Query: "${query}"

Return a JSON object with:
{
  "message": "A polite, helpful response explaining what happened",
  "suggestions": ["suggest actions the user could take"],
  "sentiment": "positive or neutral"
}`;

    const response = await this.llm.generateCompletion([{ role: 'user', content: prompt }]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return {
        message: 'I\'m sorry, but I couldn\'t process your request right now.',
        suggestions: ['Try rephrasing', 'Contact support'],
        sentiment: 'neutral'
      };
    }
  }
}