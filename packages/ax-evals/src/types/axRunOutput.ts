import type { ToolUse } from "../driver/types/toolUse.ts";
import type { InspectedConfig } from "../grading/types/inspectedConfig.ts";
import type { AskedTopic } from "../simulator/types/userAnswers.ts";
import type { Arm } from "./arm.ts";

/**
 * Everything a scorer may look at, captured by the task before the workspace
 * is deleted. Scorers never touch the filesystem.
 */
export type AxRunOutput = {
	arm: Arm;
	/** the kit skill being tested (metadata) */
	skillId?: string;
	/** every skill id the kit installed for this arm */
	kitSkillIds?: string[];
	config: InspectedConfig;
	/** the config as it looked after each user message, in order (for afterTurn) */
	configAfterTurn: InspectedConfig[];
	/** which topics the agent's questions hit, in order (for flow grading) */
	askedAbout: AskedTopic[];
	toolUses: ToolUse[];
	loadedSkills: string[];
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
