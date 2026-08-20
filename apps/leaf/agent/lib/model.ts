import { anthropic } from "@ai-sdk/anthropic";

/** One model resolution for every leaf agent: the EVE_MODEL gateway override
 * must move the specialists together with the orchestrator. */
export const leafModel = () =>
	process.env.EVE_MODEL ??
	anthropic(process.env.EVE_ANTHROPIC_MODEL ?? "claude-sonnet-5");

export const leafReasoning = "minimal" as const;
