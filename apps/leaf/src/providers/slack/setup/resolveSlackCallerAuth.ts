import type { AutumnLogger } from "@autumn/logging";
import type { ChatInstallation, ChatTrustedBot } from "@autumn/shared";
import { decrypt } from "../../../lib/crypto.js";
import {
	resolveSlackStaffAuth,
	resolveSlackUserAuth,
	resolveTrustedBotAuth,
	STAFF_OVERRIDABLE_DENIALS,
} from "./resolveSlackUserAuth.js";
import type { SlackUserAuthResult } from "./slackUserAuthTypes.js";

type SlackCallerAuthResult =
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

const toCallerAuthResult = (
	auth: SlackUserAuthResult,
): SlackCallerAuthResult => {
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

export const resolveSlackCallerAuth = async ({
	installation,
	logger,
	orgId,
	slackUserId,
	trustedBot,
}: {
	installation: ChatInstallation;
	logger: AutumnLogger;
	orgId: string;
	slackUserId: string;
	/** Set when the caller is a trusted bot; it runs as its configured member. */
	trustedBot?: ChatTrustedBot;
}): Promise<SlackCallerAuthResult> => {
	// Every install, unrestricted included, acts with the sender's own org role;
	// a sender we cannot resolve is denied, never granted the installer's access.
	try {
		if (trustedBot) {
			return toCallerAuthResult(
				await resolveTrustedBotAuth({
					installation,
					logger,
					orgId,
					trustedBot,
				}),
			);
		}
		const botToken = decrypt(installation.bot_access_token);
		const auth = await resolveSlackUserAuth({
			botToken,
			installation,
			logger,
			orgId,
			slackUserId,
		});
		if (auth.ok || !STAFF_OVERRIDABLE_DENIALS.has(auth.reason)) {
			return toCallerAuthResult(auth);
		}
		const staffAuth = await resolveSlackStaffAuth({
			botToken,
			installation,
			logger,
			orgId,
			slackUserId,
		});
		return toCallerAuthResult(staffAuth ?? auth);
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
