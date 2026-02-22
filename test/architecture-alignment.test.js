import test from 'node:test';
import assert from 'node:assert/strict';

import { BufferSystem } from '../index.js';
import { ToolExecutor, ToolRegistry } from '../src/phase2/action-engine.js';

test('BufferSystem hybrid intent forwards hybrid pipeline results into aggregation inputs', async () => {
  const system = new BufferSystem();

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

test('BufferSystem action risk check evaluates dry-run output', async () => {
  const system = new BufferSystem();
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
