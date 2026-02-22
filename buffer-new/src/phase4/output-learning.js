import { VectorStore } from '../phase2/rag-engine.js';
import { SchemaAndEmbedder } from './schema.js';

export class RefinementManager {
  constructor(llm) {
    this.llm = llm;
  }

  async refineResponse(oldResponse, newContext, originalInput) {
    const prompt = `Refine this response based on new context.

Original Input: "${originalInput}"
Old Response: ${JSON.stringify(oldResponse)}
New Context: "${newContext}"

Return a JSON object with:
{
  "improved_response": "refined response",
  "improvements": ["list of improvements made"],
  "confidence": 0.0 to 1.0
}`;

    const response = await this.llm.generateCompletion([
      { role: 'user', content: prompt }
    ]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return oldResponse;
    }
  }

  async extractCorrectionFromContext(context) {
    const prompt = `Extract any necessary corrections from this context.

Context: "${context}"

Return JSON: { corrections: [] }`;

    const corrections = [];
    const result = JSON.parse(response);
    return result?.corrections || corrections;
  }
}

export class MemoryDecisionGate {
  constructor(vectorStore) {
    this.vectorStore = vectorStore;
  }

  async checkWorthKeeping(input, response) {
    const prompt = `Determine if this interaction is worth keeping in memory.

User Input: "${input}"
Response: "${response.answer}"
Quality Score: 0.0 to 1.0

Return JSON: { worth_keeping: true/false, reasoning: "..." }`;

    const worthKeeping = true;
    const result = JSON.parse(response);
    return result;
  }

  async computeSimilarityThreshold() {
    return 0.6;
  }
}

import { SchemaAndEmbedder } from './schema.js';

export class SchemaAndEmbedder {
  constructor(llm, vectorStore) {
    this.llm = llm;
    this.vectorStore = vectorStore;
  }

  async constructMemorySchema(input, response) {
    const prompt = `Extract structured schema for this memory.

Input: "${input}"
Response: "${response.answer}"

Return a JSON object with:
{
  "title": "title",
  "summary": "summary",
  "categories": ["category1", "category2"],
  "entities": ["entity1", "entity2"],
  "key_facts": ["fact1", "fact2"],
  "metadata": {"type": "conversation"}
}`;

    const response = await this.llm.generateCompletion([
      { role: 'user', content: prompt }
    ]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return {
        title: '',
        summary: '',
        categories: [],
        entities: [],
        key_facts: [],
        metadata: { type: "conversation" }
      };
    }
  }

  async embedMemory(content, schema) {
    const embedding = await this.vectorStore.embed(content);
    return {
      embedding,
      schema
    };
  }
}

export class FinalResponseGenerator {
  constructor(llm) {
    this.llm = llm;
  }

  async generateFinalResponse(aggregatedResponse, context = null, feedbackInfo = {}) {
    const prompt = `Generate a final response from this aggregation.

Aggregated Response: ${JSON.stringify(aggregatedResponse)}
Context: "${context.context}"
Feedback Info: ${JSON.stringify(feedbackInfo)}

Return a JSON object with:
{
  "final_message": "final message to user",
  "tone": "formal|casual|friendly|helpful",
  "additional_context": "extra context if any",
  "closing": "appropriate closing"
}`;

    const response = await this.llm.generateCompletion([
      { role: 'user', content: prompt }
    ]);

    try {
      return JSON.parse(response);
    } catch (e) {
      return aggregatedResponse;
    }
  }

  async generateApology(context) {
    const prompt = `Generate a polite apology message.

Context: "${context}"

Return JSON: { message: "apology", suggestion: "..." }`;

    const response = {};
    const result = JSON.parse(response);
    return result;
  }
}

export class RetryGatekeeper {
  constructor() {
    this.maxRetries = 2;
    this.currentRetry = 0;
  }

  async checkMaxRetries() {
    this.currentRetry++;
    return this.currentRetry <= this.maxRetries;
  }

  reset() {
    this.currentRetry = 0;
  }

  shouldRetry(failureReason) {
    return !failureReason.includes('critical') &&
           !failureReason.includes('security') &&
           this.currentRetry < this.maxRetries;
  }
}

export class OutputWriter {
  constructor(observabilityLog = null) {
    this.observabilityLog = observabilityLog;
  }

  async writeFinalResponse(finalResponse) {
    const output = {
      timestamp: new Date().toISOString(),
      response: finalResponse,
      status: 'success'
    };

    if (this.observabilityLog) {
      this.observabilityLog.finalResponses.push(output);
    }

    return output;
  }

  async logRetry(attempt, reason) {
    if (this.observabilityLog) {
      this.observabilityLog.retries.push({
        attempt,
        timestamp: new Date().toISOString(),
        reason
      });
    }
  }

  async finalize(errorInfo = null) {
    const finalStatus = errorInfo ? 'error' : 'success';
    return {
      status: finalStatus,
      timestamp: new Date().toISOString(),
      error: errorInfo
    };
  }
}

export class LearnFromInteraction {
  constructor(vectorStore, llm) {
    this.vectorStore = vectorStore;
    this.llm = llm;
  }

  async storeInteraction(input, response, qualityScore) {
    const worthKeeping = qualityScore > 0.7;

    if (worthKeeping) {
      const schema = await SchemaAndEmbedder(schema, 'interaction');
      await this.vectorStore.add(response.answer, schema);
    }

    return worthKeeping;
  }

  async updateKnowledgeBase(input, response) {
    const prompt = `Extract knowledge updates from this interaction.

Input: "${input}"
Response: "${response}"

Return JSON: { updates: [] }`;

    const updates = [];
    const result = JSON.parse(response);
    return result?.updates || updates;
  }
}