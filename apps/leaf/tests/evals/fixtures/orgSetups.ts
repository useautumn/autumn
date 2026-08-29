import { emailPlatformSetup } from "./setups/emailPlatformSetup.js";
import { knowledgePlatformSetup } from "./setups/knowledgePlatformSetup.js";

export type { EvalSetup as EvalOrgSetup } from "./types.js";

export const orgSetups = {
	emailPlatform: emailPlatformSetup,
	knowledgePlatform: knowledgePlatformSetup,
} as const;
