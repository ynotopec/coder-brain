import test from 'node:test';
import assert from 'node:assert/strict';

import { DirectReplier, SafetyChecker } from '../src/phase2/chat-safety.js';

class FakeLLM {
  constructor(response) {
    this.responses = Array.isArray(response) ? response : [response];
    this.callCount = 0;
  }

  async generateCompletion() {
    const index = Math.min(this.callCount, this.responses.length - 1);
    this.callCount += 1;
    return this.responses[index];
  }
}

test('DirectReplier.generateChatResponse uses model JSON content', async () => {
  const llm = new FakeLLM(JSON.stringify({
    message: 'Je m\'appelle Coder Brain.',
    engagement_level: 'medium',
    topic_continuation: ['présentation'],
    sentiment: 'positive'
  }));

  const replier = new DirectReplier(llm);
  const reply = await replier.generateChatResponse('quel est ton nom ?');

  assert.equal(reply.message, 'Je m\'appelle Coder Brain.');
  assert.equal(reply.sentiment, 'positive');
});

test('DirectReplier fallback answers identity questions in French', async () => {
  const llm = new FakeLLM('not-json');
  const replier = new DirectReplier(llm);

  const reply = await replier.generateChatResponse('quel est ton nom ?');

  assert.equal(reply.message, 'Je m\'appelle Coder Brain.');
  assert.deepEqual(reply.topic_continuation, ['présentation']);
});

test('SafetyChecker.checkLightSafety defaults to no warning on invalid JSON', async () => {
  const llm = new FakeLLM('not-json');
  const safety = new SafetyChecker(llm);

  const result = await safety.checkLightSafety({
    context: 'quel est ton nom ?',
    entities: {}
  });

  assert.equal(result.needs_review, false);
  assert.equal(result.suggested_action, 'none');
});


test('DirectReplier retries once with strict JSON when first output is unparseable', async () => {
  const llm = new FakeLLM([
    'Je pense que je m\'appelle Coder Brain.',
    JSON.stringify({
      message: 'Je m\'appelle Coder Brain.',
      engagement_level: 'medium',
      topic_continuation: ['présentation'],
      sentiment: 'positive'
    })
  ]);

  const replier = new DirectReplier(llm);
  const reply = await replier.generateChatResponse('quel est ton nom ?');

  assert.equal(reply.message, 'Je m\'appelle Coder Brain.');
  assert.equal(llm.callCount, 2);
});
