import { autumnMcpInstructions } from "../generated/instructions.generated.js";

export { autumnMcpInstructions };

/**
 * The canonical doc bundle a chat agent (Leaf, in-app chat) loads into its
 * system prompt, in order. agent-docs owns this list; members it generates are
 * served via `withAgentDocResources`, while not-yet-migrated members (e.g.
 * plan-management) still resolve from the base MCP resources.
 */
export const agentDocBundleUris = [
	"autumn://docs/concepts",
	"autumn://docs/plan-management",
	"autumn://docs/billing",
	"autumn://docs/logs",
];
