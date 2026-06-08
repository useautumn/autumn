import { knowledgePlatformSetup } from "./setups/knowledgePlatformSetup.js";

export type { EvalSetup as EvalOrgSetup } from "./types.js";

export const orgSetups = {
	knowledgePlatform: knowledgePlatformSetup,
} as const;
