export type GenericMcpAgentDriverConfig = {
	maxSteps?: number;
	model?: string;
};

export const genericMcpAgentInstructions =
	"Use Autumn MCP tools. Call getAgentRules before customer, billing, balance, entity, or plan work. Preview destructive writes before applying them.";

export const defaultGenericMcpAgentConfig = {
	maxSteps: 6,
	model: "anthropic/claude-sonnet-4-6",
} satisfies Required<GenericMcpAgentDriverConfig>;
