import type { ToolUse } from "./toolUse.ts";

export type AgentRunResult = {
	toolUses: ToolUse[];
	loadedSkills: string[];
	apiKeySource?: string;
	model?: string;
	finalText: string;
	turnTexts: string[];
	userTexts: string[];
	turns: number;
	costUsd: number;
	wallMs: number;
	timedOut: boolean;
};
