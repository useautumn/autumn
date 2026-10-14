import { leafChatAgentDefaults } from "../../../../src/lib/chatAgentConfig.js";

export type GenericMcpAgentDriverConfig = {
	maxSteps?: number;
	model?: string;
};

export const genericMcpAgentInstructions =
	"Use Autumn MCP tools. Call getAgentRules before customer, billing, balance, entity, or plan work. Preview destructive writes before applying them.";

export const defaultGenericMcpAgentConfig = {
	maxSteps: leafChatAgentDefaults.maxSteps,
	model: process.env.EVAL_MODEL ?? leafChatAgentDefaults.model,
} satisfies Required<GenericMcpAgentDriverConfig>;
