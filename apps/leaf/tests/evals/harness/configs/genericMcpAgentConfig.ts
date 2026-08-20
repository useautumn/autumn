import { leafChatAgentDefaults } from "../../../../src/lib/chatAgentConfig.js";

export type GenericMcpAgentDriverConfig = {
	maxSteps?: number;
	model?: string;
};

export const genericMcpAgentInstructions =
	"Use Autumn MCP tools. Call getAgentRules before customer, billing, balance, entity, or plan work. Preview destructive writes before applying them.";

/** `EVAL_MODEL=openai/gpt-5.4 bun <file>.eval.ts` runs the same suite on
 * another Mastra model id without code changes. */
export const defaultGenericMcpAgentConfig = {
	maxSteps: leafChatAgentDefaults.maxSteps,
	model: process.env.EVAL_MODEL ?? leafChatAgentDefaults.model,
} satisfies Required<GenericMcpAgentDriverConfig>;
