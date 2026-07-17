import { z } from "zod";
import { missionStepTypeSchema, type AIProvider, type MissionStepType, type MissionWorkingMemory } from "@navo/agents";

export type AgentToolContext = {
  workspaceId: string;
  missionId: string;
  userId: string;
  ai: AIProvider;
  workingMemory: MissionWorkingMemory;
};

export type AgentToolDefinition<TInput = unknown, TOutput = unknown> = {
  type: MissionStepType;
  label: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  execute(input: TInput, context: AgentToolContext): Promise<TOutput>;
};

export class AgentToolRegistry {
  private readonly definitions = new Map<MissionStepType, AgentToolDefinition>();

  register<TInput, TOutput>(definition: AgentToolDefinition<TInput, TOutput>) {
    if (this.definitions.has(definition.type)) throw new Error(`AGENT_TOOL_DUPLICATE: ${definition.type}`);
    this.definitions.set(definition.type, definition as AgentToolDefinition);
    return this;
  }

  get(type: MissionStepType) {
    const definition = this.definitions.get(type);
    if (!definition) throw new Error(`AGENT_TOOL_NOT_REGISTERED: ${type}`);
    return definition;
  }

  list() {
    return [...this.definitions.values()];
  }

  async execute(type: MissionStepType, input: unknown, context: AgentToolContext) {
    const definition = this.get(type);
    const parsedInput = definition.inputSchema.parse(input);
    const output = await definition.execute(parsedInput, context);
    return definition.outputSchema.parse(output);
  }

  assertComplete() {
    const missing = missionStepTypeSchema.options.filter((type) => type !== "CREATE_TARGET_ACCOUNT" && !this.definitions.has(type));
    if (missing.length) throw new Error(`AGENT_TOOL_REGISTRY_INCOMPLETE: ${missing.join(", ")}`);
    return this;
  }
}

export const toolRecordSchema = z.record(z.string(), z.unknown());
