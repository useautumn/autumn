import type { ToolUse } from "../driver/types/toolUse.ts";
import type { InspectedConfig } from "../grading/types/inspectedConfig.ts";
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
	toolUses: ToolUse[];
	loadedSkills: string[];
	finalText: string;
	turnTexts: string[];
	turns: number;
	costUsd: number;
	wallMs: number;
	timedOut: boolean;
};
