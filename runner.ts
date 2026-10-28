import {
  AgentCassette,
  AgentMessage,
  ToolDefinition,
  ToolCall,
  ToolResult,
} from './types.js';
import { CassetteRecorder, CassettePlayer } from './cassette.js';

export interface ToolHandler {
  (args: Record<string, any>): Promise<any> | any;
}

export interface AgentContext {
  tools: Map<string, { definition: ToolDefinition; handler: ToolHandler }>;
  recorder?: CassetteRecorder;
  player?: CassettePlayer;
  mode: 'RECORD' | 'REPLAY' | 'LIVE';
}

export interface AgentStepHandler {
  (messages: AgentMessage[], availableTools: ToolDefinition[]): Promise<{
    message: AgentMessage;
    isFinal: boolean;
  }>;
}

export class AutonomousAgent {
  private name: string;
  private tools: Map<string, { definition: ToolDefinition; handler: ToolHandler }> = new Map();

  constructor(name: string) {
    this.name = name;
  }

  public registerTool(definition: ToolDefinition, handler: ToolHandler): this {
    this.tools.set(definition.name, { definition, handler });
    return this;
  }

  public getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /**
   * Run the agent loop in RECORD, REPLAY, or LIVE mode
   */
  public async executeTask(
    taskPrompt: string,
    options: {
      mode: 'RECORD' | 'REPLAY';
      stepHandler?: AgentStepHandler;
      cassetteOrPath?: AgentCassette | string;
      sessionId?: string;
    }
  ): Promise<{ finalAnswer: string; cassette: AgentCassette }> {
    const sessionId = options.sessionId || `session_${Date.now()}`;
    const tools = this.getToolDefinitions();

    if (options.mode === 'RECORD') {
      if (!options.stepHandler) {
        throw new Error('RECORD mode requires a stepHandler to produce agent decisions.');
      }

      const recorder = new CassetteRecorder({
        sessionId,
        taskPrompt,
        agentName: this.name,
        tools,
      });

      const messages: AgentMessage[] = [
        { role: 'system', content: `You are ${this.name}, an autonomous assistant.` },
        { role: 'user', content: taskPrompt },
      ];

      let stepCount = 0;
      let finalAnswer = '';
      const MAX_STEPS = 10;

      while (stepCount < MAX_STEPS) {
        stepCount++;
        const decision = await options.stepHandler(messages, tools);

        if (decision.message.toolCalls && decision.message.toolCalls.length > 0) {
          const toolResults: ToolResult[] = [];

          for (const tc of decision.message.toolCalls) {
            const registeredTool = this.tools.get(tc.name);
            let output: any;
            let error: string | undefined;

            if (!registeredTool) {
              error = `Tool '${tc.name}' not found.`;
            } else {
              try {
                output = await registeredTool.handler(tc.arguments);
              } catch (err: any) {
                error = err.message;
              }
            }

            toolResults.push({
              toolCallId: tc.id,
              name: tc.name,
              output,
              error,
            });
          }

          recorder.recordStep({
            stepIndex: stepCount,
            action: 'tool_execution',
            inputMessage: messages[messages.length - 1],
            outputMessage: decision.message,
            toolCalls: decision.message.toolCalls,
            toolResults,
          });

          messages.push(decision.message);
          for (const tr of toolResults) {
            messages.push({
              role: 'tool',
              content: JSON.stringify(tr.output ?? tr.error),
              toolResult: tr,
            });
          }
        } else {
          // Final answer
          finalAnswer = decision.message.content || '';
          recorder.recordStep({
            stepIndex: stepCount,
            action: 'final_answer',
            inputMessage: messages[messages.length - 1],
            outputMessage: decision.message,
          });
          recorder.setFinalOutput(finalAnswer);
          break;
        }
      }

      return {
        finalAnswer,
        cassette: recorder.exportCassette(),
      };
    } else {
      // REPLAY mode
      if (!options.cassetteOrPath) {
        throw new Error('REPLAY mode requires a cassetteOrPath.');
      }

      const player = new CassettePlayer(options.cassetteOrPath);
      const cassette = player.getCassette();

      // In replay mode, return directly from cassette without external network calls
      return {
        finalAnswer: cassette.finalOutput || '',
        cassette,
      };
    }
  }
}
