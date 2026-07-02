import type { AutumnLogger } from "@autumn/logging";
import type { ChatInstallation } from "@autumn/shared";
import { ChatAuthMode } from "@autumn/shared/models/chatModels/chatEnums";
import { decrypt } from "../../../lib/crypto.js";
import { resolveInstallationAuthMode } from "../../../providers/slack/users.js";
import { resolveSlackUserAuth } from "./resolveSlackUserAuth.js";
import type { SlackUserAuthResult } from "./slackUserAuthTypes.js";

export type SlackCallerAuthResult =
	| { usePerUser: false }
	| {
			usePerUser: true;
			ok: true;
			userId: string;
			role: string;
			scopes: string[];
	  }
	| { usePerUser: true; ok: false; text: string };

const SLACK_CALLER_AUTH_ERROR_TEXT =
	"I couldn't verify your Autumn permissions. Please try again, or ask an admin to reconnect Autumn if this keeps happening.";

const toCallerAuthResult = (auth: SlackUserAuthResult): SlackCallerAuthResult => {
	if (!auth.ok) {
		return { usePerUser: true, ok: false, text: auth.text };
	}
	return {
		usePerUser: true,
		ok: true,
		role: auth.role,
		scopes: auth.scopes,
		userId: auth.userId,
	};
};

/**
 * Single seam for "does this Slack sender need per-user resolution, and if so
 * are they authorized" — shared by the message path (runMessage) and the
 * approval-click path (decide) so a future change to deny reasons or
 * scope-ceiling handling can't drift between the two. `skipPerUser` lets admin
 * approval paths use their own explicit scope check instead of user reminting.
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
}): Promise<SlackCallerAuthResult> => {
	const usePerUser =
		!skipPerUser &&
		resolveInstallationAuthMode({ installation }) === ChatAuthMode.PerUser;
	if (!usePerUser) {
		return { usePerUser: false };
	}

	try {
		return toCallerAuthResult(
			await resolveSlackUserAuth({
				botToken: decrypt(installation.bot_access_token),
				installation,
				logger,
				orgId,
				slackUserId,
			}),
		);
	} catch (error) {
		logger.error("[chat] Slack caller authorization failed", error, {
			event: "leaf.slack_caller_auth_failed",
			context: {
				installation_id: installation.id,
				org_id: orgId,
			},
			data: { slack_user_id: slackUserId },
		});
		return {
			usePerUser: true,
			ok: false,
			text: SLACK_CALLER_AUTH_ERROR_TEXT,
		};
	}
};
