import test from 'node:test';
import assert from 'node:assert/strict';

import { HybridOrchestrator } from '../src/phase2/hybrid-orchestrator.js';

test('HybridOrchestrator does not return simulated action when simulation is disabled', async () => {
  const orchestrator = new HybridOrchestrator({
    actionEnabled: true,
    chatEnabled: false,
    ragEnabled: false,
    simulationEnabled: false
  });

  const action = await orchestrator.runActionPipeline({ context: 'test' });
  assert.equal(action, null);
});

test('HybridOrchestrator uses configured chat handler instead of simulated chat', async () => {
  const orchestrator = new HybridOrchestrator({
    actionEnabled: false,
    ragEnabled: false,
    chatEnabled: true,
    simulationEnabled: false,
    chatHandler: async () => ({ message: 'real handler', type: 'chat', confidence: 0.9 })
  });

  const chat = await orchestrator.runChatPipeline({ context: 'bonjour' });
  assert.equal(chat.message, 'real handler');
  assert.equal(chat.confidence, 0.9);
});
