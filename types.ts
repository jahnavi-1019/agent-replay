/**
 * AgentReplay - Types & Schemas
 */

export type AgentRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  output: any;
  error?: string;
}

export interface AgentMessage {
  role: AgentRole;
  content?: string;
  toolCalls?: ToolCall[];
  toolResult?: ToolResult;
}

export interface ExecutionStep {
  stepIndex: number;
  timestamp: string;
  action: 'llm_call' | 'tool_execution' | 'final_answer';
  inputMessage: AgentMessage;
  outputMessage?: AgentMessage;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  stateHash: string; // SHA-256 fingerprint of memory & state at this step
}

export interface AgentCassette {
  version: string;
  sessionId: string;
  taskPrompt: string;
  agentName: string;
  createdAt: string;
  sanitized: boolean;
  totalSteps: number;
  trajectoryHash: string; // Aggregate hash of entire run
  tools: ToolDefinition[];
  steps: ExecutionStep[];
  finalOutput?: string;
}

export interface StepDivergence {
  stepIndex: number;
  divergenceType: 'ACTION_MISMATCH' | 'TOOL_CALL_MISMATCH' | 'TOOL_ARGUMENT_MISMATCH' | 'STATE_HASH_DRIFT' | 'EXTRA_STEP' | 'MISSING_STEP';
  expected: any;
  actual: any;
  description: string;
}

export interface ReplayVerificationReport {
  sessionId: string;
  isDeterministic: boolean;
  goldenStepCount: number;
  replayedStepCount: number;
  divergences: StepDivergence[];
  reproducedHash: string;
  goldenHash: string;
}
