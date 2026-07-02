import type { AutumnLogger } from "@autumn/logging";
import { getScopesForUserInOrg } from "@autumn/shared/utils/auth/getScopesForUserInOrg";
import {
	type ChatInstallation,
	user as userTable,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import { ensureChatUserCredential } from "../../../internal/installations/actions/ensureChatUserCredential.js";
import { db } from "../../../lib/db.js";
import { fetchSlackUserEmailCached } from "../../../providers/slack/users.js";
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

/**
 * Resolves a Slack sender to an Autumn user, enforces that user's scope ceiling,
 * and ensures matching chat OAuth credentials exist for the installation.
 */
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
	const userId = match.userId;

	const { role, scopes } = await getScopesForUserInOrg({
		db,
		userId,
		organizationId: orgId,
	});
	if (role === null) {
		return deny("not-a-member", missingOrgUserText({ email }));
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
		userScopes: scopes,
	});

	logger.info("Resolved Slack user auth", {
		event: "leaf.slack_user_auth_resolved",
		data: { role, scope_count: supportedScopes.length },
	});
	return { ok: true, userId, role, scopes: supportedScopes };
};
