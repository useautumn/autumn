import type { ToolUse } from "../driver/types/toolUse.ts";
import type { ProbeResult } from "../grading/fixtureProbe.ts";
import type {
	OracleCatalog,
	OracleCustomer,
	OracleLicenseAssignment,
} from "../grading/sandboxOracle.ts";
import type { InspectedConfig } from "../grading/types/inspectedConfig.ts";
import type { Arm } from "./arm.ts";

export type AxRunOutput = {
	arm: Arm;
	skillId?: string;
	kitSkillIds?: string[];
	config: InspectedConfig;
	configAfterTurn: InspectedConfig[];
	toolUses: ToolUse[];
	loadedSkills: string[];
	finalText: string;
	turnTexts: string[];
	userTexts: string[];
	turns: number;
	costUsd: number;
	wallMs: number;
	timedOut: boolean;
	probe?: ProbeResult;
	oracle?: OracleCustomer;
	licenseAssignments?: OracleLicenseAssignment[];
	fixtureDiff?: string;
	catalog?: OracleCatalog;
};
