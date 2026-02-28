import test from 'node:test';
import assert from 'node:assert/strict';

import { BrainSystem } from '../index.js';
import { ToolExecutor, ToolRegistry } from '../src/phase2/action-engine.js';
import { ResponseAggregator } from '../src/phase3/response-aggregator.js';

test('BrainSystem hybrid intent forwards hybrid pipeline results into aggregation inputs', async () => {
  const system = new BrainSystem();

  const hybridResult = {
    rag: { answer: 'from rag', confidence: 0.8, has_information: true },
    action: { success: true, result: 'done' },
    chat: { message: 'from chat', confidence: 0.4 }
  };

  system.hybridOrchestrator.orchestrate = async () => hybridResult;

  let aggregatedInput;
  system.responseAggregator.aggregate = async (results) => {
    aggregatedInput = results;
    return {
      source: 'rag',
      response: hybridResult.rag,
      qualityScore: 0.8
    };
  };

  await system._executeByIntent(
    { context: 'hybrid question' },
    { intent: 'hybrid' },
    { normalized_text: 'hybrid question' }
  );

  assert.deepEqual(aggregatedInput.rag, hybridResult.rag);
  assert.deepEqual(aggregatedInput.action, hybridResult.action);
  assert.deepEqual(aggregatedInput.chat, hybridResult.chat);
});

test('BrainSystem action risk check evaluates dry-run output', async () => {
  const system = new BrainSystem();
  const tool = system.toolRegistry.getTool('calc');

  const dryRunResult = { valid: true, estimated_impact: { risk_level: 'low' } };
  let riskCheckInput;

  system.actionEngine.actionPlanner.plan = async () => ({
    tool,
    parameters: { operation: 'add', a: 1, b: 2 }
  });
  system.actionEngine.dryRunValidator.validate = async () => dryRunResult;
  system.actionEngine.riskChecker.checkRisk = async (result, parameters) => {
    riskCheckInput = { result, parameters };
    return { is_high_risk: true };
  };

  const actionResult = await system._executeAction({ context: 'add 1 and 2' });

  assert.equal(actionResult, null);
  assert.deepEqual(riskCheckInput.result, dryRunResult);
  assert.deepEqual(riskCheckInput.parameters, { operation: 'add', a: 1, b: 2 });
});

test('BrainSystem executes high-risk action when HITL approval is granted', async () => {
  const system = new BrainSystem();
  const tool = system.toolRegistry.getTool('calc');

  system.actionEngine.actionPlanner.plan = async () => ({
    tool,
    parameters: { operation: 'add', a: 3, b: 4 }
  });
  system.actionEngine.dryRunValidator.validate = async () => ({ valid: true });
  system.actionEngine.riskChecker.checkRisk = async () => ({ is_high_risk: true });
  system.toolBuilder.hitlApprover.getApproval = async () => ({ approved: true, reason: 'ok' });

  const result = await system._executeAction({ context: 'add 3 and 4' });

  assert.equal(result.success, true);
  assert.equal(result.result, 7);
});

test('BrainSystem attempts toolbuilder sandbox when no tool is available', async () => {
  const system = new BrainSystem();
  const tool = system.toolRegistry.getTool('calc');
  let sandboxCalled = false;

  system.actionEngine.actionPlanner.plan = async () => {
    if (!sandboxCalled) {
      return null;
    }

    return {
      tool,
      parameters: { operation: 'add', a: 2, b: 5 }
    };
  };
  system._runToolBuilderSandbox = async () => {
    sandboxCalled = true;
    return true;
  };
  system.actionEngine.dryRunValidator.validate = async () => ({ valid: true });
  system.actionEngine.riskChecker.checkRisk = async () => ({ is_high_risk: false });

  const result = await system._executeAction({ context: 'needs tool' });

  assert.equal(sandboxCalled, true);
  assert.equal(result.success, true);
  assert.equal(result.result, 7);
});

test('ToolExecutor.verifyOutput returns deterministic fallback when no LLM is configured', async () => {
  const executor = new ToolExecutor(new ToolRegistry());
  const result = await executor.verifyOutput({ any: 'result' });

  assert.equal(result.verify, true);
  assert.equal(result.confidence, 0.5);
  assert.deepEqual(result.issues, []);
});

test('BrainSystem fallback includes explicit failure reason and metadata when attempts are invalid', async () => {
  const system = new BrainSystem();

  system._processSingleAttempt = async () => ({
    isValid: false,
    response: { answer: 'weak' },
    qualityScore: 0.2
  });
  system.retryGatekeeper.shouldRetry = () => false;

  const result = await system._processWithRetry('test input');

  assert.equal(result.status, 'fallback');
  assert.match(result.error, /Low confidence response/);
  assert.equal(result.metadata.phase, 'fallback');
  assert.equal(result.metadata.retries, 3);
});

test('ResponseAggregator fallback-only path returns quality score above validity threshold', async () => {
  const llm = { generateCompletion: async () => 'not-json' };
  const aggregator = new ResponseAggregator(llm);

  const result = await aggregator.aggregate(
    {
      rag: null,
      action: null,
      chat: null
    },
    {
      context: 'Quelle est la capitale de la France ?',
      query_type: 'chat'
    }
  );

  assert.equal(result.source, 'chat');
  assert.ok(result.qualityScore > 0.5);
});

test('BrainSystem reports chat phase when aggregation falls back to chat after query intent', async () => {
  const system = new BrainSystem();

  system._executeRag = async () => ({
    message: 'not enough information',
    suggestions: ['clarify'],
    sentiment: 'neutral'
  });
  system.responseAggregator.aggregate = async () => ({
    source: 'chat',
    response: { message: 'please resend your request', confidence: 0.6 },
    qualityScore: 0.6
  });

  const result = await system._executeByIntent(
    { context: '' },
    { intent: 'query' },
    { normalized_text: '' }
  );

  assert.equal(result.source, 'chat');
  assert.equal(result.phase, 'chat');
});

test('BrainSystem marks empty-index RAG fallback as missing information', async () => {
  const system = new BrainSystem();

  system.ragEngine.queryPlanner.plan = async () => ({ parameters: { top_k: 3 } });
  system.ragEngine.vectorStore.embed = async () => [0.1, 0.2, 0.3];
  system.ragEngine.vectorStore.search = async () => [];
  system.ragEngine.answerGenerator.fallbackMessage = async () => ({
    message: "I'm sorry, but I wasn't able to provide the answer to your request right now."
  });

  const result = await system._executeRag({ context: '2 + 2 ?' });

  assert.equal(result.has_information, false);
  assert.equal(result.sources.length, 0);
});





test('BrainSystem can process direct LLM requests before routing to RAG', async () => {
  const system = new BrainSystem();

  system.contextBuilder.normalizeInput = async (input) => ({
    normalized_text: input,
    intent_type: 'query',
    entities: [],
    keywords: []
  });
  system.contextBuilder.buildContext = async (normalized) => ({
    context: normalized.normalized_text,
    query_type: 'query',
    entities: []
  });
  system._canProcessDirectly = async () => ({
    can_process_directly: true,
    direct_answer: 'Réponse directe',
    confidence: 0.99
  });

  let ragCalled = false;
  system._executeRag = async () => {
    ragCalled = true;
    return null;
  };

  const result = await system._processSingleAttempt('question simple', 0);

  assert.equal(ragCalled, false);
  assert.equal(result.phase, 'chat');
  assert.equal(result.response.message, 'Réponse directe');
});
