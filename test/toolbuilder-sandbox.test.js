import test from 'node:test';
import assert from 'node:assert/strict';

import { RollbackManager, ToolPromoter } from '../src/phase2/toolbuilder-sandbox.js';

test('RollbackManager removes tool using registry unregisterTool API', async () => {
  let removedToolId = null;
  const registry = {
    unregisterTool(toolId) {
      removedToolId = toolId;
      return true;
    }
  };

  const rollbackManager = new RollbackManager(registry);
  const result = await rollbackManager.rollback('calc');

  assert.equal(removedToolId, 'calc');
  assert.equal(result.success, true);
});

test('ToolPromoter sanitizer blocks dangerous process access but allows error handling', async () => {
  const promoter = new ToolPromoter({ registerTool() {} });

  const dangerous = promoter._sanitizeImplementation('return process.env.SECRET;');
  assert.equal(dangerous.valid, false);

  const safe = promoter._sanitizeImplementation('try { return { ok: true }; } catch (e) { return { ok: false }; }');
  assert.equal(safe.valid, true);
});
