import type { AutumnLogger } from "@autumn/logging";
import { ChatAuthMode, type ChatInstallation } from "@autumn/shared";
import type { SlackUserAuthResult } from "./resolveSlackUserAuth.js";

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

export const SLACK_CALLER_AUTH_ERROR_TEXT =
	"I couldn't verify your Autumn permissions. Please try again, or ask an admin to reconnect Autumn if this keeps happening.";

type ResolveSlackCallerAuthDeps = {
	decrypt: (data: string) => string;
	resolveInstallationAuthMode: ({
		installation,
	}: {
		installation: ChatInstallation;
	}) => ChatAuthMode;
	resolveSlackUserAuth: (params: {
		botToken: string;
		installation: ChatInstallation;
		logger: AutumnLogger;
		orgId: string;
		slackUserId: string;
	}) => Promise<SlackUserAuthResult>;
};

export const resolveSlackCallerAuthCore = async ({
	deps,
	installation,
	logger,
	orgId,
	skipPerUser = false,
	slackUserId,
}: {
	deps: ResolveSlackCallerAuthDeps;
	installation: ChatInstallation;
	logger: AutumnLogger;
	orgId: string;
	skipPerUser?: boolean;
	slackUserId: string;
}): Promise<SlackCallerAuthResult> => {
	const usePerUser =
		!skipPerUser &&
		deps.resolveInstallationAuthMode({ installation }) === ChatAuthMode.PerUser;
	if (!usePerUser) {
		return { usePerUser: false };
	}

	try {
		const auth = await deps.resolveSlackUserAuth({
			botToken: deps.decrypt(installation.bot_access_token),
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
