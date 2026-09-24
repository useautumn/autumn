import type { AppEnv } from "@autumn/shared";

const SANDBOX_RULE =
	'Never choose sandbox unless the user explicitly asks for the sandbox environment by name. Mentions of testing, a test deployment, a demo, a demo environment, or the word "environment" on its own are not requests for sandbox.';

export const chatEnvSelectorInstructions = (defaultEnv: AppEnv): string =>
	`Choose the Autumn environment for the latest user request. Default to ${defaultEnv}. Use the other environment only when the user clearly and explicitly asks for it by name. ${SANDBOX_RULE}`;

export const chatEnvSelectorOutputInstructions = (defaultEnv: AppEnv): string =>
	`Return ${defaultEnv} unless the latest user request explicitly asks by name to use the other environment. ${SANDBOX_RULE}`;

export const chatOrgSelectorInstructions =
	"Extract the Autumn organization reference from the latest Slack thread-starting user message. Return the user's org phrase, slug, or ID; do not invent an org when none is mentioned.";

export const chatOrgSelectorOutputInstructions =
	"Return org_identifier only when the message explicitly names an org, org slug, or org ID. Otherwise return null.";
