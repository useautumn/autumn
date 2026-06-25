import { autumnMcpInstructions } from "../generated/instructions.generated.js";
import { leafPrompts } from "../generated/leaf-prompts.generated.js";

export { autumnMcpInstructions };

export type LeafSurface = keyof typeof leafPrompts;

/**
 * Leaf's base system instructions for a surface, composed from
 * `content/instructions/leaf/*` (shared base + per-surface nudge). The dashboard
 * leans toward plan management; Slack toward billing + investigation.
 */
export const leafSystemPrompt = (surface: LeafSurface): string =>
	leafPrompts[surface];

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
