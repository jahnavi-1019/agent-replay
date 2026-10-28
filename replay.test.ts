import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AutonomousAgent } from './runner.js';
import { compareCassettes } from './divergence.js';

test('AgentReplay: records multi-step agent trajectory and replayed run is 100% deterministic', async () => {
  const agent = new AutonomousAgent('RefundAssistant');

  // Register real mock tools
  agent.registerTool(
    {
      name: 'fetch_order',
      description: 'Fetch order details',
      parameters: { orderId: 'string' },
    },
    (args) => ({ orderId: args.orderId, amount: 89.0, status: 'DELIVERED', customer: 'alice@example.com' })
  );

  agent.registerTool(
    {
      name: 'issue_refund',
      description: 'Issue refund to customer',
      parameters: { orderId: 'string', reason: 'string' },
    },
    (args) => ({ refundId: 'ref_12345', success: true, refundedAmount: 89.0 })
  );

  // Define deterministic step handler simulating an LLM decision sequence
  let callCount = 0;
  const mockStepHandler = async (messages: any[]) => {
    callCount++;
    if (callCount === 1) {
      return {
        message: {
          role: 'assistant' as const,
          content: 'Let me look up order ORD-991.',
          toolCalls: [{ id: 'call_1', name: 'fetch_order', arguments: { orderId: 'ORD-991' } }],
        },
        isFinal: false,
      };
    } else if (callCount === 2) {
      return {
        message: {
          role: 'assistant' as const,
          content: 'Order found. Issuing refund now.',
          toolCalls: [{ id: 'call_2', name: 'issue_refund', arguments: { orderId: 'ORD-991', reason: 'Damaged item' } }],
        },
        isFinal: false,
      };
    } else {
      return {
        message: {
          role: 'assistant' as const,
          content: 'Refund of $89.00 has been processed successfully under ID ref_12345.',
        },
        isFinal: true,
      };
    }
  };

  // 1. Record golden run
  const recordResult = await agent.executeTask('Please refund order ORD-991 for damaged item.', {
    mode: 'RECORD',
    stepHandler: mockStepHandler,
    sessionId: 'session_golden_01',
  });

  const goldenCassette = recordResult.cassette;

  assert.equal(goldenCassette.steps.length, 3, 'Must record 3 execution steps');
  assert.equal(goldenCassette.sanitized, true, 'Cassette must be marked sanitized');
  assert.ok(goldenCassette.trajectoryHash.length === 64, 'Must compute SHA-256 trajectory hash');
  assert.equal(recordResult.finalAnswer, 'Refund of $89.00 has been processed successfully under ID ref_12345.');

  // 2. Replay run from cassette
  const replayResult = await agent.executeTask('Please refund order ORD-991 for damaged item.', {
    mode: 'REPLAY',
    cassetteOrPath: goldenCassette,
  });

  assert.equal(replayResult.finalAnswer, recordResult.finalAnswer, 'Replay output must match golden output');

  // 3. Compare trajectories
  const report = compareCassettes(goldenCassette, replayResult.cassette);
  assert.equal(report.isDeterministic, true, 'Replay must be 100% deterministic');
  assert.equal(report.divergences.length, 0, 'Zero divergences expected');
});
