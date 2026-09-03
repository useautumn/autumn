import type { ToolUse } from "../driver/types/toolUse.ts";
import type { ProbeResult } from "../grading/fixtureProbe.ts";
import type {
	OracleCustomer,
	OracleLicenseAssignment,
} from "../grading/sandboxOracle.ts";
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
	/** the config as it looked after each user message, in order (for afterTurn) */
	configAfterTurn: InspectedConfig[];
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
	/** integration cases: requests replayed against the agent-edited fixture */
	probe?: ProbeResult;
	/** integration cases: the run org's customer state after the probe */
	oracle?: OracleCustomer;
	/** integration cases: active license assignments after the probe */
	licenseAssignments?: OracleLicenseAssignment[];
	/** integration cases: unified diff of the agent's fixture edits */
	fixtureDiff?: string;
};
