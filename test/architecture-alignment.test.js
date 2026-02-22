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
