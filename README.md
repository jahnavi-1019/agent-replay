# 📼 AgentReplay

> **Deterministic Debugging, Time-Travel, & Regression Testing for AI Agents**  
> *Sanitized Cassette Recording & Divergence Localization Engine*

[![CI](https://github.com/user/agent-replay/actions/workflows/ci.yml/badge.svg)](https://github.com/user/agent-replay)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js: >=20.0.0](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-green.svg)](https://nodejs.org)
[![TypeScript: Strict](https://img.shields.io/badge/TypeScript-Strict-blue)](https://www.typescriptlang.org)

---

## 📌 Problem Statement

Autonomous AI agents (e.g., customer service bots, code refactoring agents, analytical reasoning workflows) are inherently **stochastic and non-deterministic**. 

When an agent regression occurs in production, developers face severe pain points:
- **Non-reproducible regressions:** Re-running the agent with the same prompt often triggers different completions or alternative tool calls.
- **Leaked secrets & PII:** Raw agent execution traces frequently capture live API tokens, user passwords, emails, and sensitive database responses.
- **Expensive CI pipelines:** Running multi-step agent test suites against live LLMs incurs substantial API costs, rate-limiting, and network flakiness.

**AgentReplay solves this.** Inspired by the VCR / cassette pattern, it records multi-turn agent interactions, **cryptographically hashes memory states**, **scrubs secrets & PII client-side**, and enables **deterministic offline playback** in CI with automated **divergence localization**.

---

## 🏛️ Architecture & Processing Pipeline

```
  [User Task Prompt]
          │
          ▼
   [Autonomous Agent Loop] ◄──► [Local / Mock Tools]
          │
          ├─► [PII & Secret Sanitizer] (Regex & Schema Scrubber)
          │
          ├─► [Cryptographic State Hasher] (Canonical SHA-256)
          │
          ▼
   ┌───────────────────────────────────────────────┐
   │            Sanitized Agent Cassette           │
   │  (Steps, Tool In/Out, State Hashes, Tokens)  │
   └───────────────────────────────────────────────┘
          │
          ├─► [Offline Replay Mode] ──► 0-Cost Deterministic CI Gate
          │
          └─► [Divergence Localization Engine] ──► Pinpoints Drifted Steps
```

---

## 🔒 Secret & PII Scrubbing Guarantees

Before any cassette is persisted to disk, AgentReplay passes every message, prompt, tool argument, and tool result through a recursive sanitization pipeline:
- **API Keys:** Scans and redacts OpenAI (`sk-...`), Anthropic (`sk-ant-...`), and custom tokens.
- **Authentication Headers:** Scans and redacts `Bearer` tokens and sensitive auth strings.
- **Sensitive JSON Keys:** Recursively scrubs keys matching `password`, `secret`, `api_key`, `access_token`, `private_key`.
- **Customer PII:** Automatically redacts credit cards (Luhn-compliant regex), Social Security Numbers, and emails.

---

## 🚀 Quick Start & CLI Usage

### Installation
```bash
# Clone the repository
git clone https://github.com/your-username/agent-replay.git
cd agent-replay

# Install dependencies and compile
npm install
npm run build
```

### 1. Inspect a Recorded Agent Cassette
```bash
node dist/src/cli.js inspect tests/fixtures/golden-cassette.json
```
*Output:*
```
📼 AgentReplay - AI Agent Regression & Time-Travel Debugger
Deterministic replay, sanitized cassettes, and divergence localization

Session ID:       session_golden_refund_01
Agent Name:       CustomerSupportAgent
Task Prompt:      "Customer requests a refund for damaged order ORD-7729."
Created At:       2026-10-13T18:00:00.000Z
Trajectory Hash:  5a415b39e6a9876543210fedcba9876543210fedcba9876543210fedcba98765
Sanitized:        ✔ YES (PII/Secrets Scrubbed)
Total Steps:      3

Execution Trajectory:
  [Step 1] TOOL_EXECUTION (Hash: 9b12a34f5e6d...)
    🛠 Tool: lookup_order
       Args: {"orderId":"ORD-7729"}
       Output: {"orderId":"ORD-7729","amount":75.5,"status":"DELIVERED","customerEmail":"[REDACTED_EMAIL]"}
```

### 2. Localize Trajectory Divergences (Diffing Two Runs)
```bash
node dist/src/cli.js diff tests/fixtures/golden-cassette.json tests/fixtures/drifted-cassette.json
```
*Output:*
```
Comparing Candidate against Golden Baseline Cassette:

Golden Hash:     5a415b39e6a9876543210fedcba9876543210fedcba9876543210fedcba98765
Candidate Hash:  3c912a77f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7
Golden Steps:    3
Candidate Steps: 3

✖ DIVERGENCE DETECTED (1 mismatch point):

  [Step 2 Divergence: TOOL_ARGUMENT_MISMATCH]
    Step 2 tool 'process_refund' argument drift. Expected {"amount":75.5,"orderId":"ORD-7729"}, received {"amount":750,"orderId":"ORD-7729"}.
    Expected: {"orderId":"ORD-7729","amount":75.5}
    Actual:   {"orderId":"ORD-7729","amount":750}
```

---

## 💻 Programmatic TypeScript API

```typescript
import { AutonomousAgent, compareCassettes } from '@portfolio/agent-replay';

const agent = new AutonomousAgent('BillingBot');

// 1. Register tools
agent.registerTool({
  name: 'lookup_account',
  description: 'Lookup billing account info',
  parameters: { accountId: 'string' }
}, async (args) => ({ balance: 120.0, status: 'ACTIVE' }));

// 2. Record golden run
const { finalAnswer, cassette } = await agent.executeTask('Check balance on ACCT-12', {
  mode: 'RECORD',
  stepHandler: async (messages, tools) => {
    // LLM decision logic...
  }
});

// 3. Replay in CI (Zero LLM API cost, fully deterministic)
const replayed = await agent.executeTask('Check balance on ACCT-12', {
  mode: 'REPLAY',
  cassetteOrPath: cassette
});

// 4. Verify determinism
const report = compareCassettes(cassette, replayed.cassette);
console.log(`Deterministic: ${report.isDeterministic}`); // true
```

---

## 🧪 Automated Testing & Evaluation

AgentReplay is validated through an automated suite covering secret sanitization, deterministic replay, and divergence localization:

```bash
npm run test
```

### Verification Results
```
✔ AgentReplay Divergence: localizes tool argument drift (9.0ms)
✔ AgentReplay Divergence: localizes tool selection mismatch (2.6ms)
✔ AgentReplay: records multi-step agent trajectory and replayed run is 100% deterministic (5.6ms)
✔ AgentReplay Sanitization: redacts OpenAI and Anthropic API keys (1.6ms)
✔ AgentReplay Sanitization: redacts Bearer tokens, emails, and credit cards in deep objects (0.5ms)

ℹ tests 5
ℹ pass 5
ℹ fail 0
ℹ duration_ms 140.21
```

---

## 🔄 GitHub Actions CI/CD Regression Gate

Add `.github/workflows/agent-regression-gate.yml` to your repository:

```yaml
name: Agent Regression Gate

on:
  pull_request:
    paths:
      - 'prompts/**'
      - 'src/agent/**'

jobs:
  verify-agent-determinism:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install AgentReplay
        run: npm ci

      - name: Replay Golden Cassettes
        run: |
          node dist/src/cli.js diff tests/fixtures/golden-cassette.json tests/fixtures/candidate-cassette.json
```

---

## 📄 License
MIT © Antigravity Engineering
