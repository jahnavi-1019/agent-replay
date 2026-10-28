import * as fs from 'node:fs';
import * as path from 'node:path';
import { AgentCassette, ExecutionStep, ToolDefinition } from './types.js';
import { sanitizePayload } from './redactor.js';
import { computeHash, computeStepStateHash } from './hasher.js';

export class CassetteRecorder {
  private sessionId: string;
  private taskPrompt: string;
  private agentName: string;
  private tools: ToolDefinition[];
  private steps: ExecutionStep[] = [];
  private finalOutput?: string;

  constructor(options: { sessionId: string; taskPrompt: string; agentName: string; tools: ToolDefinition[] }) {
    this.sessionId = options.sessionId;
    this.taskPrompt = options.taskPrompt;
    this.agentName = options.agentName;
    this.tools = options.tools;
  }

  public recordStep(step: Omit<ExecutionStep, 'stateHash' | 'timestamp'>): ExecutionStep {
    const sanitizedInput = sanitizePayload(step.inputMessage);
    const sanitizedOutput = sanitizePayload(step.outputMessage);
    const sanitizedToolCalls = sanitizePayload(step.toolCalls);
    const sanitizedToolResults = sanitizePayload(step.toolResults);

    const stateHash = computeStepStateHash(
      step.stepIndex,
      step.action,
      sanitizedOutput || sanitizedInput,
      sanitizedToolCalls
    );

    const recordedStep: ExecutionStep = {
      stepIndex: step.stepIndex,
      timestamp: new Date().toISOString(),
      action: step.action,
      inputMessage: sanitizedInput,
      outputMessage: sanitizedOutput,
      toolCalls: sanitizedToolCalls,
      toolResults: sanitizedToolResults,
      stateHash,
    };

    this.steps.push(recordedStep);
    return recordedStep;
  }

  public setFinalOutput(output: string) {
    this.finalOutput = sanitizePayload(output);
  }

  public exportCassette(): AgentCassette {
    const trajectoryHash = computeHash(this.steps.map((s) => s.stateHash));

    return {
      version: '1.0.0',
      sessionId: this.sessionId,
      taskPrompt: sanitizePayload(this.taskPrompt),
      agentName: this.agentName,
      createdAt: new Date().toISOString(),
      sanitized: true,
      totalSteps: this.steps.length,
      trajectoryHash,
      tools: this.tools,
      steps: this.steps,
      finalOutput: this.finalOutput,
    };
  }

  public saveToFile(filePath: string): void {
    const cassette = this.exportCassette();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(cassette, null, 2), 'utf-8');
  }
}

export class CassettePlayer {
  private cassette: AgentCassette;
  private currentStepPointer = 0;

  constructor(cassetteOrPath: AgentCassette | string) {
    if (typeof cassetteOrPath === 'string') {
      const raw = fs.readFileSync(path.resolve(cassetteOrPath), 'utf-8');
      this.cassette = JSON.parse(raw);
    } else {
      this.cassette = cassetteOrPath;
    }
  }

  public getCassette(): AgentCassette {
    return this.cassette;
  }

  public getNextStep(): ExecutionStep | undefined {
    if (this.currentStepPointer >= this.cassette.steps.length) {
      return undefined;
    }
    return this.cassette.steps[this.currentStepPointer++];
  }

  public reset(): void {
    this.currentStepPointer = 0;
  }
}
