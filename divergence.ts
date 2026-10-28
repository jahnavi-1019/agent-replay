import { AgentCassette, ReplayVerificationReport, StepDivergence } from './types.js';
import { canonicalJsonStringify } from './hasher.js';

/**
 * Compares a candidate/replayed cassette against a golden baseline cassette.
 * Pinpoints divergence step index and root cause.
 */
export function compareCassettes(
  golden: AgentCassette,
  candidate: AgentCassette
): ReplayVerificationReport {
  const divergences: StepDivergence[] = [];
  const maxSteps = Math.max(golden.steps.length, candidate.steps.length);

  for (let i = 0; i < maxSteps; i++) {
    const goldenStep = golden.steps[i];
    const candidateStep = candidate.steps[i];

    if (goldenStep && !candidateStep) {
      divergences.push({
        stepIndex: i + 1,
        divergenceType: 'MISSING_STEP',
        expected: goldenStep.action,
        actual: null,
        description: `Candidate agent terminated prematurely at step ${i + 1}. Expected action '${goldenStep.action}'.`,
      });
      continue;
    }

    if (!goldenStep && candidateStep) {
      divergences.push({
        stepIndex: i + 1,
        divergenceType: 'EXTRA_STEP',
        expected: null,
        actual: candidateStep.action,
        description: `Candidate agent executed extra step ${i + 1} with action '${candidateStep.action}'.`,
      });
      continue;
    }

    // 1. Check action type mismatch
    if (goldenStep.action !== candidateStep.action) {
      divergences.push({
        stepIndex: i + 1,
        divergenceType: 'ACTION_MISMATCH',
        expected: goldenStep.action,
        actual: candidateStep.action,
        description: `Step ${i + 1} action mismatch: expected '${goldenStep.action}', got '${candidateStep.action}'.`,
      });
    }

    // 2. Check tool calls
    const goldenTools = goldenStep.toolCalls || [];
    const candidateTools = candidateStep.toolCalls || [];

    if (goldenTools.length !== candidateTools.length) {
      divergences.push({
        stepIndex: i + 1,
        divergenceType: 'TOOL_CALL_MISMATCH',
        expected: goldenTools.map((t) => t.name),
        actual: candidateTools.map((t) => t.name),
        description: `Step ${i + 1} tool count mismatch: expected ${goldenTools.length} tool(s), got ${candidateTools.length}.`,
      });
    } else {
      for (let t = 0; t < goldenTools.length; t++) {
        const gTool = goldenTools[t];
        const cTool = candidateTools[t];

        if (gTool.name !== cTool.name) {
          divergences.push({
            stepIndex: i + 1,
            divergenceType: 'TOOL_CALL_MISMATCH',
            expected: gTool.name,
            actual: cTool.name,
            description: `Step ${i + 1} tool selection divergence: golden called '${gTool.name}', but candidate called '${cTool.name}'.`,
          });
        } else {
          // Compare arguments
          const gArgs = canonicalJsonStringify(gTool.arguments);
          const cArgs = canonicalJsonStringify(cTool.arguments);
          if (gArgs !== cArgs) {
            divergences.push({
              stepIndex: i + 1,
              divergenceType: 'TOOL_ARGUMENT_MISMATCH',
              expected: gTool.arguments,
              actual: cTool.arguments,
              description: `Step ${i + 1} tool '${gTool.name}' argument drift. Expected ${gArgs}, received ${cArgs}.`,
            });
          }
        }
      }
    }

    // 3. Check cryptographic state hash drift
    if (goldenStep.stateHash !== candidateStep.stateHash && divergences.length === 0) {
      divergences.push({
        stepIndex: i + 1,
        divergenceType: 'STATE_HASH_DRIFT',
        expected: goldenStep.stateHash,
        actual: candidateStep.stateHash,
        description: `Step ${i + 1} decision state hash drifted. Reasoning or generated tokens diverged.`,
      });
    }
  }

  const isDeterministic = divergences.length === 0 && golden.trajectoryHash === candidate.trajectoryHash;

  return {
    sessionId: candidate.sessionId,
    isDeterministic,
    goldenStepCount: golden.steps.length,
    replayedStepCount: candidate.steps.length,
    divergences,
    goldenHash: golden.trajectoryHash,
    reproducedHash: candidate.trajectoryHash,
  };
}
