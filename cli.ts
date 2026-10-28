#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CassettePlayer } from './cassette.js';
import { compareCassettes } from './divergence.js';
import { sanitizePayload } from './redactor.js';
import { AgentCassette } from './types.js';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';

function printBanner() {
  console.log(`\n${BOLD}${CYAN}📼 AgentReplay - AI Agent Regression & Time-Travel Debugger${RESET}`);
  console.log(`${GRAY}Deterministic replay, sanitized cassettes, and divergence localization${RESET}\n`);
}

function printHelp() {
  printBanner();
  console.log(`Usage: agent-replay <command> [options]\n`);
  console.log(`Commands:`);
  console.log(`  inspect <cassette.json>            Examine recorded steps, tool calls, and hashes`);
  console.log(`  diff <golden.json> <candidate.json> Localize step divergences between two runs`);
  console.log(`  sanitize <in.json> -o <out.json>   Scrub PII and secrets from any agent trace\n`);
  console.log(`Options:`);
  console.log(`  --json                             Output results as raw JSON`);
  console.log(`  --help                             Display this help message\n`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const command = args[0];
  const isJson = args.includes('--json');

  if (command === 'inspect') {
    const file = args[1];
    if (!file) {
      console.error(`${RED}Error: inspect requires <cassette.json>${RESET}`);
      process.exit(1);
    }

    try {
      const player = new CassettePlayer(file);
      const c = player.getCassette();

      if (isJson) {
        console.log(JSON.stringify(c, null, 2));
        process.exit(0);
      }

      printBanner();
      console.log(`Session ID:       ${BOLD}${c.sessionId}${RESET}`);
      console.log(`Agent Name:       ${CYAN}${c.agentName}${RESET}`);
      console.log(`Task Prompt:      "${c.taskPrompt}"`);
      console.log(`Created At:       ${GRAY}${c.createdAt}${RESET}`);
      console.log(`Trajectory Hash:  ${YELLOW}${c.trajectoryHash}${RESET}`);
      console.log(`Sanitized:        ${c.sanitized ? GREEN + '✔ YES (PII/Secrets Scrubbed)' : RED + '✖ NO'}${RESET}`);
      console.log(`Total Steps:      ${BOLD}${c.totalSteps}${RESET}\n`);

      console.log(`${BOLD}Execution Trajectory:${RESET}`);
      for (const step of c.steps) {
        console.log(`\n  ${CYAN}[Step ${step.stepIndex}]${RESET} ${BOLD}${step.action.toUpperCase()}${RESET} ${GRAY}(Hash: ${step.stateHash.slice(0, 12)}...)${RESET}`);
        if (step.toolCalls && step.toolCalls.length > 0) {
          for (const tc of step.toolCalls) {
            console.log(`    🛠 Tool: ${BOLD}${tc.name}${RESET}`);
            console.log(`       Args: ${JSON.stringify(tc.arguments)}`);
          }
        }
        if (step.toolResults && step.toolResults.length > 0) {
          for (const tr of step.toolResults) {
            console.log(`       Output: ${JSON.stringify(tr.output ?? tr.error)}`);
          }
        }
        if (step.outputMessage?.content) {
          console.log(`    💬 Output: "${step.outputMessage.content}"`);
        }
      }

      if (c.finalOutput) {
        console.log(`\n${BOLD}Final Answer:${RESET}\n"${c.finalOutput}"\n`);
      }
    } catch (err: any) {
      console.error(`${RED}Failed to inspect cassette: ${err.message}${RESET}`);
      process.exit(1);
    }
  } else if (command === 'diff') {
    const goldenFile = args[1];
    const candidateFile = args[2];

    if (!goldenFile || !candidateFile) {
      console.error(`${RED}Error: diff requires <golden.json> and <candidate.json>${RESET}`);
      process.exit(1);
    }

    try {
      const goldenRaw = JSON.parse(fs.readFileSync(path.resolve(goldenFile), 'utf-8')) as AgentCassette;
      const candidateRaw = JSON.parse(fs.readFileSync(path.resolve(candidateFile), 'utf-8')) as AgentCassette;

      const report = compareCassettes(goldenRaw, candidateRaw);

      if (isJson) {
        console.log(JSON.stringify(report, null, 2));
        process.exit(report.isDeterministic ? 0 : 1);
      }

      printBanner();
      console.log(`Comparing Candidate against Golden Baseline Cassette:\n`);
      console.log(`Golden Hash:     ${YELLOW}${report.goldenHash}${RESET}`);
      console.log(`Candidate Hash:  ${YELLOW}${report.reproducedHash}${RESET}`);
      console.log(`Golden Steps:    ${report.goldenStepCount}`);
      console.log(`Candidate Steps: ${report.replayedStepCount}\n`);

      if (report.isDeterministic) {
        console.log(`${GREEN}${BOLD}✔ PERFECT MATCH: Trajectory is 100% deterministic with zero divergence!${RESET}\n`);
        process.exit(0);
      } else {
        console.log(`${RED}${BOLD}✖ DIVERGENCE DETECTED (${report.divergences.length} mismatch points):${RESET}\n`);
        for (const div of report.divergences) {
          console.log(`  ${RED}[Step ${div.stepIndex} Divergence: ${div.divergenceType}]${RESET}`);
          console.log(`    ${div.description}`);
          if (div.expected !== undefined && div.actual !== undefined) {
            console.log(`    ${GRAY}Expected:${RESET} ${JSON.stringify(div.expected)}`);
            console.log(`    ${GRAY}Actual:  ${RESET} ${JSON.stringify(div.actual)}`);
          }
        }
        console.log('');
        process.exit(1);
      }
    } catch (err: any) {
      console.error(`${RED}Diff failed: ${err.message}${RESET}`);
      process.exit(1);
    }
  } else if (command === 'sanitize') {
    const inFile = args[1];
    const outIndex = args.indexOf('-o');
    const outFile = outIndex !== -1 ? args[outIndex + 1] : undefined;

    if (!inFile || !outFile) {
      console.error(`${RED}Error: sanitize requires <in.json> -o <out.json>${RESET}`);
      process.exit(1);
    }

    try {
      const raw = JSON.parse(fs.readFileSync(path.resolve(inFile), 'utf-8'));
      const sanitized = sanitizePayload(raw);
      fs.writeFileSync(path.resolve(outFile), JSON.stringify(sanitized, null, 2), 'utf-8');
      console.log(`${GREEN}✔ Scrubbed secrets & PII: ${outFile}${RESET}`);
    } catch (err: any) {
      console.error(`${RED}Sanitization failed: ${err.message}${RESET}`);
      process.exit(1);
    }
  } else {
    console.error(`${RED}Unknown command: ${command}${RESET}`);
    printHelp();
    process.exit(1);
  }
}

main();
