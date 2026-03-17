import test from 'node:test';
import assert from 'node:assert/strict';
import { ContextBuilder, IntentRouter, LongTermMemory } from '../src/phase1/context.js';

test('ContextBuilder.normalizeInput parses fenced JSON responses', async () => {
  const llm = {
    generateCompletion: async () => '```json\n{"normalized_text":"hello","intent_type":"chat","entities":[],"keywords":["hello"]}\n```'
  };
  const longTermMemory = { retrieve: async () => [] };
  const builder = new ContextBuilder(llm, null, longTermMemory);

  const normalized = await builder.normalizeInput('hello');

  assert.equal(normalized.normalized_text, 'hello');
  assert.equal(normalized.intent_type, 'chat');
  assert.deepEqual(normalized.keywords, ['hello']);
});

test('IntentRouter.route parses fenced JSON responses', async () => {
  const llm = {
    generateCompletion: async () => '```json\n{"intent":"query","confidence":0.9,"reasoning":"because"}\n```'
  };
  const router = new IntentRouter(llm);

  const route = await router.route({ context: 'find docs', query_type: 'query', entities: [] });

  assert.equal(route.intent, 'query');
  assert.equal(route.confidence, 0.9);
  assert.equal(route.reasoning, 'because');
});

test('LongTermMemory.retrieve returns empty list when embedding model is unavailable', async () => {
  const ltm = new LongTermMemory({
    embed: async () => {
      throw new Error('OpenAI API Error: model "text-embedding-3-small" not found, try pulling it first');
    },
    search: async () => {
      throw new Error('should not be called');
    }
  });

  const results = await ltm.retrieve('what is my previous context?');

  assert.deepEqual(results, []);
});
