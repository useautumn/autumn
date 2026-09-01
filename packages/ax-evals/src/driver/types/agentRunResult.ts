import type { ToolUse } from "./toolUse.ts";

export type AgentRunResult = {
	toolUses: ToolUse[];
	loadedSkills: string[];
	/** "none" = subscription OAuth; anything else names the API key source */
	apiKeySource?: string;
	/** the model the session actually resolved to */
	model?: string;
	finalText: string;
	/** the agent's closing text of each user turn, in order */
	turnTexts: string[];
	/** every user message sent, in order (for transcript judging) */
	userTexts: string[];
	turns: number;
	costUsd: number;
	wallMs: number;
	timedOut: boolean;
};
