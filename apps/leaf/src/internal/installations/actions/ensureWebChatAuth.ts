import crypto from "node:crypto";
import {
	AppEnv,
	type ChatInstallation,
	type ChatOAuthCredential,
	chatInstallations,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import { db } from "../../../lib/db.js";
import { getChatOAuthCredentialByInstallationEnv } from "../repos/chatOAuthCredentialsRepo.js";
import {
	replaceInstallationOAuthCredentials,
	resolveAgentScopes,
} from "./replaceInstallationOAuthCredentials.js";

export const WEB_CHAT_PROVIDER = "web" as const;

// Re-mint a refresh token this far before it dies so a turn never races expiry.
const REFRESH_EXPIRY_SKEW_MS = 60 * 60 * 1000;

const scopeSetsEqual = (a: string[], b: string[]) => {
	if (a.length !== b.length) {
		return false;
	}
	const set = new Set(a);
	return b.every((scope) => set.has(scope));
};

/**
 * A per-user web credential is stale (must be re-minted from the cookie) when its
 * refresh token has expired, or the user's scopes no longer match what it was
 * minted with (e.g. an upgrade/downgrade).
 */
const isWebCredentialStale = ({
	credential,
	desiredScopes,
}: {
	credential: ChatOAuthCredential;
	desiredScopes: string[];
}) =>
	credential.refresh_token_expires_at == null ||
	credential.refresh_token_expires_at - REFRESH_EXPIRY_SKEW_MS <= Date.now() ||
	!scopeSetsEqual(credential.scopes, desiredScopes);

/**
 * Web chat has no Slack-style install, so we synthesize one "web" installation
 * per org (placeholder bot token; never used) to carry an MCP OAuth credential —
 * which the claude-managed vault then refreshes, exactly like Slack.
 */
const ensureWebInstallation = async ({
	orgId,
}: {
	orgId: string;
}): Promise<ChatInstallation> => {
	const where = and(
		eq(chatInstallations.org_id, orgId),
		eq(chatInstallations.provider, WEB_CHAT_PROVIDER),
	);
	const existing = await db.query.chatInstallations.findFirst({ where });
	if (existing) {
		return existing;
	}

	const now = Date.now();
	const [created] = await db
		.insert(chatInstallations)
		.values({
			id: `chatinst_${crypto.randomUUID().replace(/-/g, "")}`,
			org_id: orgId,
			provider: WEB_CHAT_PROVIDER,
			workspace_id: orgId,
			workspace_name: "Dashboard",
			bot_access_token: "web",
			scopes: [],
			default_env: AppEnv.Sandbox,
			created_at: now,
			updated_at: now,
		})
		.onConflictDoNothing()
		.returning();
	if (created) {
		return created;
	}
	// Lost an insert race — read the row the other writer created.
	const row = await db.query.chatInstallations.findFirst({ where });
	if (!row) {
		throw new Error("Failed to ensure web chat installation");
	}
	return row;
};

/**
 * Ensure the org's web installation + a per-user MCP OAuth credential bound to
 * `userScopes` exist, then return the installation. The credential is (re)minted
 * — from the caller's already-verified better-auth cookie — only when missing,
 * scope-changed, or its refresh token has expired. Warm path is two indexed
 * lookups. `userScopes` come from the cookie's get-session (customSession), so a
 * member's chat token never exceeds their dashboard privileges.
 */
export const ensureWebChatAuth = async ({
	orgId,
	userId,
	userScopes,
}: {
	orgId: string;
	userId: string;
	userScopes: string[];
}): Promise<ChatInstallation> => {
	const installation = await ensureWebInstallation({ orgId });
	const credential = await getChatOAuthCredentialByInstallationEnv({
		db,
		chatInstallationId: installation.id,
		env: AppEnv.Sandbox,
		orgId,
		userId,
	});
	const desiredScopes = resolveAgentScopes(userScopes);
	if (!credential || isWebCredentialStale({ credential, desiredScopes })) {
		await db.transaction((tx) =>
			replaceInstallationOAuthCredentials({
				tx,
				installation,
				userId,
				orgId,
				agentScopes: userScopes,
			}),
		);
	}
	return installation;
};
