import type { AutumnLogger } from "@autumn/logging";
import type { ChatInstallation } from "@autumn/shared";
import { decrypt } from "../../../lib/crypto.js";
import { resolveInstallationAuthMode } from "../../../providers/slack/users.js";
import {
	resolveSlackCallerAuthCore,
	type SlackCallerAuthResult,
} from "./resolveSlackCallerAuthCore.js";
import { resolveSlackUserAuth } from "./resolveSlackUserAuth.js";

/**
 * Single seam for "does this Slack sender need per-user resolution, and if so
 * are they authorized" — shared by the message path (runMessage) and the
 * approval-click path (decide) so a future change to deny reasons or
 * scope-ceiling handling can't drift between the two.
 */
export const resolveSlackCallerAuth = async ({
	installation,
	logger,
	orgId,
	skipPerUser = false,
	slackUserId,
}: {
	installation: ChatInstallation;
	logger: AutumnLogger;
	orgId: string;
	skipPerUser?: boolean;
	slackUserId: string;
}): Promise<SlackCallerAuthResult> =>
	resolveSlackCallerAuthCore({
		deps: {
			decrypt,
			resolveInstallationAuthMode,
			resolveSlackUserAuth,
		},
		installation,
		logger,
		orgId,
		skipPerUser,
		slackUserId,
	});
