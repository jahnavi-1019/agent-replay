import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AutonomousAgent } from './runner.js';
import { compareCassettes } from './divergence.js';

test('AgentReplay Divergence: localizes tool argument drift', async () => {
  const agent = new AutonomousAgent('OrderAgent');
  agent.registerTool({ name: 'update_price', description: 'Update price', parameters: {} }, (a) => a);

  // Golden run: updates price to 100
  const golden = await agent.executeTask('Update price', {
    mode: 'RECORD',
    stepHandler: async () => ({
      message: {
        role: 'assistant',
        toolCalls: [{ id: 'c1', name: 'update_price', arguments: { sku: 'SKU-1', price: 100 } }],
      },
      isFinal: false,
    }),
  });

  // Candidate run: drifted argument to 200
  const drifted = await agent.executeTask('Update price', {
    mode: 'RECORD',
    stepHandler: async () => ({
      message: {
        role: 'assistant',
        toolCalls: [{ id: 'c1', name: 'update_price', arguments: { sku: 'SKU-1', price: 200 } }],
      },
      isFinal: false,
    }),
  });

  const report = compareCassettes(golden.cassette, drifted.cassette);

  assert.equal(report.isDeterministic, false, 'Drifted run must be non-deterministic');
  assert.ok(report.divergences.length >= 1, 'Must detect divergence');

  const div = report.divergences[0];
  assert.equal(div.stepIndex, 1, 'Divergence pinpointed at step 1');
  assert.equal(div.divergenceType, 'TOOL_ARGUMENT_MISMATCH');
  assert.ok(div.description.includes('argument drift'));
});

test('AgentReplay Divergence: localizes tool selection mismatch', async () => {
  const agent = new AutonomousAgent('AdminAgent');
  agent.registerTool({ name: 'view_log', description: 'View log', parameters: {} }, () => 'logs');
  agent.registerTool({ name: 'delete_database', description: 'Drop DB', parameters: {} }, () => 'deleted');

  // Golden run: views log
  const golden = await agent.executeTask('Inspect system', {
    mode: 'RECORD',
    stepHandler: async () => ({
      message: {
        role: 'assistant',
        toolCalls: [{ id: 'c1', name: 'view_log', arguments: { limit: 10 } }],
      },
      isFinal: false,
    }),
  });

  // Candidate run: rogue agent calls delete_database
  const candidate = await agent.executeTask('Inspect system', {
    mode: 'RECORD',
    stepHandler: async () => ({
      message: {
        role: 'assistant',
        toolCalls: [{ id: 'c1', name: 'delete_database', arguments: { force: true } }],
      },
      isFinal: false,
    }),
  });

  const report = compareCassettes(golden.cassette, candidate.cassette);

  assert.equal(report.isDeterministic, false);
  const div = report.divergences.find((d) => d.divergenceType === 'TOOL_CALL_MISMATCH');
  assert.ok(div, 'Must flag TOOL_CALL_MISMATCH');
  assert.equal(div?.expected, 'view_log');
  assert.equal(div?.actual, 'delete_database');
});
