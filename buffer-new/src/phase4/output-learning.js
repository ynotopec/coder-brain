import { SchemaAndEmbedder as BaseSchemaAndEmbedder } from '../common/schema.js';

export class RefinementManager {
  constructor(llm, vectorStore = null) {
    this.llm = llm;
    this.vectorStore = vectorStore;
    this.schemaAndEmbedder = vectorStore ? new BaseSchemaAndEmbedder(llm, vectorStore) : null;
  }

  async generateFinalResponse(aggregatedResponse) {
    if (!aggregatedResponse) {
      return { answer: 'No response available.', confidence: 0.1 };
    }

    if (typeof aggregatedResponse === 'string') {
      return { answer: aggregatedResponse, confidence: 0.7 };
    }

    return {
      answer: aggregatedResponse.answer || aggregatedResponse.message || JSON.stringify(aggregatedResponse),
      confidence: aggregatedResponse.confidence || 0.7,
      details: aggregatedResponse
    };
  }

  async checkWorthKeeping(input, response) {
    return Boolean(input && response && (response.answer || response.message));
  }

  async constructMemorySchema(input, response) {
    if (this.schemaAndEmbedder) {
      return this.schemaAndEmbedder.constructMemorySchema(input, response);
    }

    return {
      title: 'interaction',
      summary: `${String(input).slice(0, 60)}`,
      categories: ['conversation'],
      entities: [],
      key_facts: [],
      metadata: { type: 'conversation' }
    };
  }

  async embedMemory(content, schema) {
    if (this.schemaAndEmbedder) {
      return this.schemaAndEmbedder.embedMemory(content, schema);
    }

    return { embedding: [], schema };
  }
}

export class MemoryDecisionGate {
  async checkWorthKeeping(input, response) {
    return Boolean(input && response);
  }

  async computeSimilarityThreshold() {
    return 0.6;
  }
}

export class SchemaAndEmbedder extends BaseSchemaAndEmbedder {}

export class RetryGatekeeper {
  constructor() {
    this.maxRetries = 2;
    this.currentRetry = 0;
  }

  reset() {
    this.currentRetry = 0;
  }

  shouldRetry(failureReason) {
    this.currentRetry += 1;
    return !failureReason.includes('critical') && !failureReason.includes('security') && this.currentRetry <= this.maxRetries;
  }
}

export class OutputWriter {
  constructor(observabilityLog = null) {
    this.observabilityLog = observabilityLog;
  }

  async writeFinalResponse(finalResponse) {
    const output = { timestamp: new Date().toISOString(), response: finalResponse, status: 'success' };
    if (this.observabilityLog) this.observabilityLog.finalResponses.push(output);
    return output;
  }
}
