import test from 'node:test';
import assert from 'node:assert/strict';

import { OpenAIInterface } from '../src/common.js';

test('OpenAIInterface requires explicit offline mode when API key is missing', async () => {
  const llm = new OpenAIInterface(undefined, { explicitOffline: false });

  await assert.rejects(
    llm.generateCompletion([{ role: 'user', content: 'hello' }]),
    /requires OPENAI_API_KEY/
  );
});

test('OpenAIInterface offline mode works only when explicitly enabled', async () => {
  const llm = new OpenAIInterface(undefined, { explicitOffline: true });
  const response = await llm.generateCompletion([{ role: 'user', content: 'hello' }]);

  assert.equal(response, 'I can help with that.');
});

test('OpenAIInterface surfaces network errors when API is unreachable', async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('network down');
  };

  try {
    const llm = new OpenAIInterface('test-key', { explicitOffline: false });

    await assert.rejects(
      llm.generateCompletion([{ role: 'user', content: 'hello' }]),
      /network down/
    );
  } finally {
    global.fetch = previousFetch;
  }
});

test('OpenAIInterface embed uses supported default encoding format', async () => {
  const previousFetch = global.fetch;
  let requestBody;

  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      async json() {
        return { data: [{ embedding: [0.1, 0.2] }] };
      }
    };
  };

  try {
    const llm = new OpenAIInterface('test-key', { explicitOffline: false });
    const embedding = await llm.embed('hello world');

    assert.deepEqual(embedding, [0.1, 0.2]);
    assert.equal(requestBody.encoding_format, 'float');
  } finally {
    global.fetch = previousFetch;
  }
});
