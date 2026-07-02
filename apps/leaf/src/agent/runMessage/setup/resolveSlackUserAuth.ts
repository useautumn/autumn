import type { AutumnLogger } from "@autumn/logging";
import {
	type ChatInstallation,
	DEFAULT_OAUTH_RESOURCE_SCOPES,
	getScopesForUserInOrg,
	user as userTable,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import { ensureChatUserCredential } from "../../../internal/installations/actions/ensureChatUserCredential.js";
import { db } from "../../../lib/db.js";
import { fetchSlackUserEmailCached } from "../../../providers/slack/users.js";

type SlackAuthDenyReason =
	| "slack-email-unavailable"
	| "no-autumn-user"
	| "ambiguous-autumn-user"
	| "not-a-member"
	| "invalid-role"
	| "no-supported-scopes";

const DENY_TEXT: Record<SlackAuthDenyReason, string> = {
	"slack-email-unavailable":
		"I couldn't read your Slack email, so I can't verify your Autumn permissions. The workspace may need to reconnect the Autumn app to grant the new permission — please ask a workspace admin to reconnect Autumn.",
	"no-autumn-user":
		"I couldn't find an Autumn account matching your Slack email. Sign in to Autumn with the same email address, or ask an admin to invite you.",
	"ambiguous-autumn-user":
		"Multiple Autumn accounts share your Slack email, so I can't tell which one is you. Ask an admin to resolve the duplicate accounts before I can act on your behalf.",
	"not-a-member":
		"Your Autumn account isn't a member of this workspace's Autumn organization, so I can't act on your behalf here. Ask an admin to add you.",
	"invalid-role":
		"Your role in this Autumn organization isn't recognized, so I can't grant any permissions. Ask an admin to review your access.",
	"no-supported-scopes":
		"Your Autumn role doesn't include any permissions the Slack bot can use. Ask an admin to adjust your access.",
};

export type SlackUserAuthResult =
	| { ok: true; userId: string; role: string; scopes: string[] }
	| { ok: false; reason: SlackAuthDenyReason; text: string };

// Bot ceiling, as a plain string set so we can probe arbitrary ScopeStrings.
const OAUTH_CEILING = new Set<string>(DEFAULT_OAUTH_RESOURCE_SCOPES);

type AutumnUserMatch =
	| { kind: "none" }
	| { kind: "single"; userId: string }
	| { kind: "ambiguous" };

const resolveAutumnUserIdByEmail = async (
	email: string,
): Promise<AutumnUserMatch> => {
	const matches = await db.query.user.findMany({
		where: sql`lower(${userTable.email}) = ${email.toLowerCase()}`,
		columns: { id: true },
		limit: 2,
	});
	if (matches.length === 0) {
		return { kind: "none" };
	}
	if (matches.length > 1) {
		return { kind: "ambiguous" };
	}
	return { kind: "single", userId: matches[0].id };
};

export const resolveSlackUserAuth = async ({
	botToken,
	installation,
	logger,
	orgId,
	slackUserId,
}: {
	botToken: string;
	installation: ChatInstallation;
	logger: AutumnLogger;
	orgId: string;
	slackUserId: string;
}): Promise<SlackUserAuthResult> => {
	const deny = (
		reason: SlackAuthDenyReason,
		text: string = DENY_TEXT[reason],
	): SlackUserAuthResult => {
		logger.warn("Slack user auth denied", {
			event: "leaf.slack_user_auth_denied",
			data: { reason },
		});
		return { ok: false, reason, text };
	};

	const email = await fetchSlackUserEmailCached({
		botToken,
		installationId: installation.id,
		slackUserId,
	});
	if (!email) {
		return deny("slack-email-unavailable");
	}

	const match = await resolveAutumnUserIdByEmail(email);
	if (match.kind === "ambiguous") {
		return deny("ambiguous-autumn-user");
	}
	if (match.kind === "none") {
		return deny(
			"no-autumn-user",
			`Sorry, your email address (${email}) was not found in the Autumn organization. Please ask an admin to invite you.`,
		);
	}
	const userId = match.userId;

	const { role, scopes } = await getScopesForUserInOrg({
		db,
		userId,
		organizationId: orgId,
	});
	if (role === null) {
		return deny("not-a-member");
	}
	if (scopes.length === 0) {
		return deny("invalid-role");
	}

	const supportedScopes = scopes.filter((scope) => OAUTH_CEILING.has(scope));
	if (supportedScopes.length === 0) {
		return deny("no-supported-scopes");
	}

	// Pass the full role scopes; replaceInstallationOAuthCredentials bounds them to
	// the ceiling (== supportedScopes here) when minting.
	await ensureChatUserCredential({
		installation,
		orgId,
		userId,
		userScopes: scopes,
	});

	logger.info("Resolved Slack user auth", {
		event: "leaf.slack_user_auth_resolved",
		data: { role, scope_count: supportedScopes.length },
	});
	return { ok: true, userId, role, scopes: supportedScopes };
};
