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
      ok: true,
      statusText: 'OK',
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




test('OpenAIInterface accepts OpenAI-style array content blocks', async () => {
  const previousFetch = global.fetch;

  global.fetch = async () => ({
    ok: true,
    statusText: 'OK',
    async json() {
      return {
        choices: [{
          message: {
            content: [{ type: 'text', text: '{"ok":true}' }]
          }
        }]
      };
    }
  });

  try {
    const llm = new OpenAIInterface('test-key', { explicitOffline: false });
    const response = await llm.generateCompletion([{ role: 'user', content: 'hello' }]);
    assert.equal(response, '{"ok":true}');
  } finally {
    global.fetch = previousFetch;
  }
});

test('OpenAIInterface accepts completion text fallback payloads', async () => {
  const previousFetch = global.fetch;

  global.fetch = async () => ({
    ok: true,
    statusText: 'OK',
    async json() {
      return { choices: [{ text: 'plain text completion' }] };
    }
  });

  try {
    const llm = new OpenAIInterface('test-key', { explicitOffline: false });
    const response = await llm.generateCompletion([{ role: 'user', content: 'hello' }]);
    assert.equal(response, 'plain text completion');
  } finally {
    global.fetch = previousFetch;
  }
});
test('OpenAIInterface surfaces HTTP errors even when body has no API error object', async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    statusText: 'Unauthorized',
    async json() {
      return {};
    }
  });

  try {
    const llm = new OpenAIInterface('test-key', { explicitOffline: false });

    await assert.rejects(
      llm.generateCompletion([{ role: 'user', content: 'hello' }]),
      /Unauthorized/
    );
  } finally {
    global.fetch = previousFetch;
  }
});

test('OpenAIInterface embed throws when vector data is missing from success response', async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    statusText: 'OK',
    async json() {
      return { data: [] };
    }
  });

  try {
    const llm = new OpenAIInterface('test-key', { explicitOffline: false });

    await assert.rejects(
      llm.embed('hello world'),
      /did not include vector data/
    );
  } finally {
    global.fetch = previousFetch;
  }
});

test('OpenAIInterface offline normalization preserves alphanumeric keywords', async () => {
  const llm = new OpenAIInterface(undefined, { explicitOffline: true });
  const response = await llm.generateCompletion([{
    role: 'user',
    content: 'Normalize and parse the following user input\nUser Input: "What is the capital of France?!"'
  }]);

  const parsed = JSON.parse(response);
  assert.deepEqual(parsed.keywords, ['What', 'is', 'the', 'capital', 'of', 'France']);
});

test('OpenAIInterface offline fallback message uses proper apostrophe encoding', async () => {
  const llm = new OpenAIInterface(undefined, { explicitOffline: true });
  const response = await llm.generateCompletion([{
    role: 'user',
    content: 'Generate a helpful fallback message'
  }]);

  const parsed = JSON.parse(response);
  assert.equal(parsed.message, 'Je n’ai pas assez de contexte local pour répondre précisément.');
});


test('OpenAIInterface allows ollama provider without API key', async () => {
  const previousFetch = global.fetch;
  let requestUrl;
  let requestHeaders;

  global.fetch = async (url, options) => {
    requestUrl = url;
    requestHeaders = options.headers;
    return {
      ok: true,
      statusText: 'OK',
      async json() {
        return { message: { content: 'hello from ollama' } };
      }
    };
  };

  try {
    const llm = new OpenAIInterface(undefined, { explicitOffline: false, provider: 'ollama', baseUrl: 'http://127.0.0.1:11434' });
    const response = await llm.generateCompletion([{ role: 'user', content: 'hello' }]);

    assert.equal(response, 'hello from ollama');
    assert.equal(requestUrl, 'http://127.0.0.1:11434/api/chat');
    assert.equal(requestHeaders.Authorization, undefined);
  } finally {
    global.fetch = previousFetch;
  }
});

test('OpenAIInterface ollama embed reads embedding payload format', async () => {
  const previousFetch = global.fetch;

  global.fetch = async () => ({
    ok: true,
    statusText: 'OK',
    async json() {
      return { embedding: [0.11, 0.22, 0.33] };
    }
  });

  try {
    const llm = new OpenAIInterface(undefined, { explicitOffline: false, provider: 'ollama', baseUrl: 'http://127.0.0.1:11434' });
    const embedding = await llm.embed('hello world');
    assert.deepEqual(embedding, [0.11, 0.22, 0.33]);
  } finally {
    global.fetch = previousFetch;
  }
});

test('OpenAIInterface rejects unsupported provider names', () => {
  assert.throws(
    () => new OpenAIInterface(undefined, { provider: 'localai' }),
    /Unsupported provider/
  );
});

test('OpenAIInterface auto-selects ollama when API key is missing and ollama hints exist', () => {
  const previousBaseUrl = process.env.LLM_BASE_URL;
  const previousProvider = process.env.LLM_PROVIDER;

  process.env.LLM_PROVIDER = '';
  process.env.LLM_BASE_URL = 'http://127.0.0.1:11434';

  try {
    const llm = new OpenAIInterface(undefined, { explicitOffline: true });
    assert.equal(llm.provider, 'ollama');
  } finally {
    if (previousBaseUrl === undefined) delete process.env.LLM_BASE_URL;
    else process.env.LLM_BASE_URL = previousBaseUrl;

    if (previousProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = previousProvider;
  }
});


test('OpenAIInterface uses configured chat model for OpenAI payload', async () => {
  const previousFetch = global.fetch;
  let requestBody;

  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      statusText: 'OK',
      async json() {
        return { choices: [{ message: { content: 'ok' } }] };
      }
    };
  };

  try {
    const llm = new OpenAIInterface('test-key', { explicitOffline: false, chatModel: 'gpt-4o-mini' });
    await llm.generateCompletion([{ role: 'user', content: 'hello' }]);
    assert.equal(requestBody.model, 'gpt-4o-mini');
  } finally {
    global.fetch = previousFetch;
  }
});

test('OpenAIInterface avoids duplicating /v1 when OPENAI_BASE_URL already includes /v1', async () => {
  const previousFetch = global.fetch;
  let requestUrl;

  global.fetch = async (url) => {
    requestUrl = url;
    return {
      ok: true,
      statusText: 'OK',
      async json() {
        return { choices: [{ message: { content: 'ok' } }] };
      }
    };
  };

  try {
    const llm = new OpenAIInterface('test-key', {
      explicitOffline: false,
      provider: 'openai',
      baseUrl: 'http://127.0.0.1:11434/v1'
    });
    await llm.generateCompletion([{ role: 'user', content: 'hello' }]);
    assert.equal(requestUrl, 'http://127.0.0.1:11434/v1/chat/completions');
  } finally {
    global.fetch = previousFetch;
  }
});

test('OpenAIInterface uses configured models for Ollama payloads', async () => {
  const previousFetch = global.fetch;
  const models = [];

  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    models.push(body.model);

    if (body.prompt) {
      return {
        ok: true,
        statusText: 'OK',
        async json() {
          return { embedding: [0.1, 0.2] };
        }
      };
    }

    return {
      ok: true,
      statusText: 'OK',
      async json() {
        return { message: { content: 'ok' } };
      }
    };
  };

  try {
    const llm = new OpenAIInterface(undefined, {
      explicitOffline: false,
      provider: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      chatModel: 'qwen2.5:7b',
      embeddingModel: 'mxbai-embed-large'
    });

    await llm.generateCompletion([{ role: 'user', content: 'hello' }]);
    await llm.embed('hello world');

    assert.deepEqual(models, ['qwen2.5:7b', 'mxbai-embed-large']);
  } finally {
    global.fetch = previousFetch;
  }
});
