import type { AppEnv } from "@autumn/shared";

/** Prompts for the small routing classifiers (env + org selection). Kept beside
 * the agent's other prompts; the selectors themselves hold only the logic. */

export const chatEnvSelectorInstructions = (defaultEnv: AppEnv): string =>
	`Choose the Autumn environment for the latest user request. Default to ${defaultEnv}. Use the other environment only when the user clearly asks for it.`;

export const chatEnvSelectorOutputInstructions = (defaultEnv: AppEnv): string =>
	`Return ${defaultEnv} unless the latest user request clearly asks to use the other environment.`;

export const chatOrgSelectorInstructions =
	"Extract the Autumn organization reference from the latest Slack thread-starting user message. Return the user's org phrase, slug, or ID; do not invent an org when none is mentioned.";

export const chatOrgSelectorOutputInstructions =
	"Return org_identifier only when the message explicitly names an org, org slug, or org ID. Otherwise return null.";
