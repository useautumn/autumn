import type { Feature } from "../../compose/models/index.js";
import type { Plan } from "../../compose/models/variantModels.js";
import type { ReferralProgram, Reward } from "../../compose/index.js";
import type { AppEnv } from "../../lib/env/index.js";
import type { UpdateResult } from "../../lib/transforms/inPlaceUpdate/index.js";

export interface PullOptions {
	generateSdkTypes?: boolean;
	cwd?: string;
	environment?: AppEnv;
	forceOverwrite?: boolean;
	noDeclarationFile?: boolean;
	allVersions?: boolean;
}

export interface PullResult {
	features: Feature[];
	plans: Plan[];
	rewards: Reward[];
	referralPrograms: ReferralProgram[];
	configPath: string;
	sdkTypesPath?: string;
	inPlace?: boolean;
	updateResult?: UpdateResult;
}

export interface EnvironmentData {
	features: Feature[];
	plans: Plan[];
	rewards: Reward[];
	referralPrograms: ReferralProgram[];
}
