import type { AutumnLogger } from "@autumn/logging";
import { ChatAuthMode, type ChatInstallation } from "@autumn/shared";
import { decrypt } from "../../../lib/crypto.js";
import { resolveInstallationAuthMode } from "../../../providers/slack/users.js";
import { resolveSlackUserAuth } from "./resolveSlackUserAuth.js";

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
	// Admin installs keep the installer-scoped flow even when the auth mode is
	// PerUser; only the caller (runMessage) knows about that admin bypass.
	skipPerUser?: boolean;
	slackUserId: string;
}): Promise<SlackCallerAuthResult> => {
	const usePerUser =
		!skipPerUser &&
		resolveInstallationAuthMode({ installation }) === ChatAuthMode.PerUser;
	if (!usePerUser) {
		return { usePerUser: false };
	}

	const auth = await resolveSlackUserAuth({
		botToken: decrypt(installation.bot_access_token),
		installation,
		logger,
		orgId,
		slackUserId,
	});
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
