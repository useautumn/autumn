import type { AutumnLogger } from "@autumn/logging";
import {
	type ChatInstallation,
	type ChatTrustedBot,
	user as userTable,
} from "@autumn/shared";
import { getScopesForUserInOrg } from "@autumn/shared/utils/auth/getScopesForUserInOrg";
import { sql } from "drizzle-orm";
import { ensureChatUserCredential } from "../../../internal/installations/actions/ensureChatUserCredential.js";
import { db } from "../../../lib/db.js";
import { env } from "../../../lib/env.js";
import {
	fetchSlackUserEmailCached,
	fetchSlackUserHomeTeamId,
} from "../users.js";
import {
	DENY_TEXT,
	OAUTH_CEILING,
	type SlackAuthDenyReason,
	type SlackUserAuthResult,
} from "./slackUserAuthTypes.js";

type AutumnUserMatch =
	| { kind: "none" }
	| { kind: "single"; userId: string }
	| { kind: "ambiguous" };

const missingOrgUserText = ({ email }: { email: string }) =>
	`Sorry, we couldn't find any user in the Autumn organization with the email address ${email} and cannot fetch your permissions. Please ask an admin to add you to the organization on Autumn.`;

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

const slackAuthDenier =
	({ logger }: { logger: AutumnLogger }) =>
	(
		reason: SlackAuthDenyReason,
		text: string = DENY_TEXT[reason],
	): SlackUserAuthResult => {
		logger.warn("Slack user auth denied", {
			event: "leaf.slack_user_auth_denied",
			data: { reason },
		});
		return { ok: false, reason, text };
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
	const deny = slackAuthDenier({ logger });
	if (installation.org_id !== orgId) {
		logger.error("[chat] Slack installation org mismatch", undefined, {
			event: "leaf.slack_user_auth_org_mismatch",
			context: {
				installation_id: installation.id,
				installation_org_id: installation.org_id,
				org_id: orgId,
			},
			data: { slack_user_id: slackUserId },
		});
		return deny("installation-org-mismatch");
	}

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
		return deny("no-autumn-user", missingOrgUserText({ email }));
	}
	return await authorizeAutumnUser({
		installation,
		logger,
		missingMemberText: missingOrgUserText({ email }),
		orgId,
		userId: match.userId,
	});
};

/** Grants an Autumn user's org role to a Slack turn: the user must be a
 * member with scopes the agent can use, and gets a chat credential for them. */
export const authorizeAutumnUser = async ({
	installation,
	logger,
	missingMemberText,
	orgId,
	userId,
}: {
	installation: ChatInstallation;
	logger: AutumnLogger;
	missingMemberText?: string;
	orgId: string;
	userId: string;
}): Promise<SlackUserAuthResult> => {
	const deny = slackAuthDenier({ logger });
	const { role, scopes } = await getScopesForUserInOrg({
		db,
		userId,
		organizationId: orgId,
	});
	if (role === null) {
		return deny("not-a-member", missingMemberText);
	}
	if (scopes.length === 0) {
		return deny("invalid-role");
	}

	const supportedScopes = scopes.filter((scope) => OAUTH_CEILING.has(scope));
	if (supportedScopes.length === 0) {
		return deny("no-supported-scopes");
	}

	await ensureChatUserCredential({
		installation,
		orgId,
		userId,
		userScopes: supportedScopes,
	});

	logger.info("Resolved Slack user auth", {
		event: "leaf.slack_user_auth_resolved",
		data: { role, scope_count: supportedScopes.length },
	});
	return { ok: true, userId, role, scopes: supportedScopes };
};

/** A trusted bot has no Slack email to match, so its turns take the role of
 * the member it was configured to run as, re-checked on every turn. */
export const resolveTrustedBotAuth = async ({
	installation,
	logger,
	orgId,
	trustedBot,
}: {
	installation: ChatInstallation;
	logger: AutumnLogger;
	orgId: string;
	trustedBot: ChatTrustedBot;
}): Promise<SlackUserAuthResult> => {
	if (installation.org_id !== orgId) {
		return slackAuthDenier({ logger })("installation-org-mismatch");
	}
	const auth = await authorizeAutumnUser({
		installation,
		logger,
		orgId,
		userId: trustedBot.run_as_user_id,
	});
	if (auth.ok) return auth;
	return {
		...auth,
		text: `${trustedBot.name} acts as an Autumn member who can't use the agent in this organization anymore. Ask an admin to update it under Trusted bots in Autumn's Slack settings.`,
	};
};

const parseSlackStaffUserIds = (value?: string) =>
	new Set(
		(value ?? "")
			.split(",")
			.map((id) => id.trim())
			.filter(Boolean),
	);

/** Denials that mean "we don't know you in this org", which a staff override
 * may answer; a member whose own role is too narrow stays denied. */
export const STAFF_OVERRIDABLE_DENIALS = new Set<SlackAuthDenyReason>([
	"ambiguous-autumn-user",
	"no-autumn-user",
	"not-a-member",
	"slack-email-unavailable",
]);

/** Autumn staff may use the agent in any customer's installation. A staff
 * caller is an allowlisted Slack user id whose home team is Autumn's own
 * workspace (never their email, which the customer's workspace reports), and
 * their turn runs as the member who installed the app. Returns null when the
 * caller is not staff. */
export const resolveSlackStaffAuth = async ({
	authorize = authorizeAutumnUser,
	botToken,
	fetchHomeTeamId = fetchSlackUserHomeTeamId,
	installation,
	logger,
	orgId,
	slackUserId,
	staffTeamId = env.SLACK_ADMIN_WORKSPACE_ID,
	staffUserIds = parseSlackStaffUserIds(env.SLACK_STAFF_USER_IDS),
}: {
	authorize?: typeof authorizeAutumnUser;
	botToken: string;
	fetchHomeTeamId?: typeof fetchSlackUserHomeTeamId;
	installation: ChatInstallation;
	logger: AutumnLogger;
	orgId: string;
	slackUserId: string;
	staffTeamId?: string;
	staffUserIds?: ReadonlySet<string>;
}): Promise<SlackUserAuthResult | null> => {
	if (!(staffTeamId && staffUserIds.has(slackUserId))) return null;
	if (installation.org_id !== orgId) return null;

	const homeTeamId = await fetchHomeTeamId({ botToken, slackUserId });
	if (homeTeamId !== staffTeamId) {
		logger.warn("Slack staff override denied", {
			event: "leaf.slack_staff_override_denied",
			data: { reason: "home_team_mismatch", slack_user_id: slackUserId },
		});
		return null;
	}

	const installerUserId = installation.installed_by_user_id;
	if (!installerUserId) {
		logger.warn("Slack staff override denied", {
			event: "leaf.slack_staff_override_denied",
			data: { reason: "installer_missing", slack_user_id: slackUserId },
		});
		return null;
	}

	const auth = await authorize({
		installation,
		logger,
		orgId,
		userId: installerUserId,
	});
	logger.info("Slack staff override", {
		event: "leaf.slack_staff_override_used",
		data: {
			ok: auth.ok,
			run_as_user_id: installerUserId,
			slack_user_id: slackUserId,
		},
	});
	return auth;
};
