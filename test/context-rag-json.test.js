import test from 'node:test';
import assert from 'node:assert/strict';

import { ContextBuilder } from '../src/phase1/context.js';
import { AnswerGenerator } from '../src/phase2/rag-engine.js';

class FakeLLM {
  constructor(responses) {
    this.responses = Array.isArray(responses) ? responses : [responses];
    this.callCount = 0;
  }

  async generateCompletion() {
    const index = Math.min(this.callCount, this.responses.length - 1);
    this.callCount += 1;
    return this.responses[index];
  }
}

test('ContextBuilder.normalizeInput parses JSON wrapped in fenced markdown', async () => {
  const llm = new FakeLLM('```json\n{"normalized_text":"qui est-ce ?","intent_type":"chat","entities":[],"keywords":["qui","est-ce"]}\n```');
  const contextBuilder = new ContextBuilder(llm, null, { retrieve: async () => [] });

  const result = await contextBuilder.normalizeInput('qui est-ce ?');

  assert.equal(result.normalized_text, 'qui est-ce ?');
  assert.equal(result.intent_type, 'chat');
});

test('AnswerGenerator.fallbackMessage parses fenced JSON responses', async () => {
  const llm = new FakeLLM('```json\n{"message":"Je peux aider si vous précisez la personne.","suggestions":["Ajouter du contexte"],"sentiment":"neutral"}\n```');
  const generator = new AnswerGenerator(llm);

  const result = await generator.fallbackMessage('qui est-ce ?');

  assert.equal(result.message, 'Je peux aider si vous précisez la personne.');
  assert.deepEqual(result.suggestions, ['Ajouter du contexte']);
  assert.equal(result.sentiment, 'neutral');
});
