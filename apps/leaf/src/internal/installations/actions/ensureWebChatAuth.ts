import crypto from "node:crypto";
import {
	AppEnv,
	type ChatInstallation,
	chatInstallations,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import { db } from "../../../lib/db.js";
import { getChatOAuthCredentialByInstallationEnv } from "../repos/chatOAuthCredentialsRepo.js";
import { replaceInstallationOAuthCredentials } from "./replaceInstallationOAuthCredentials.js";

export const WEB_CHAT_PROVIDER = "web" as const;

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
 * Ensure the org's web installation + MCP OAuth credential exist (provisioning
 * once), then return the installation. Two indexed lookups on the warm path;
 * the credential provisioning runs only the first time.
 */
export const ensureWebChatAuth = async ({
	orgId,
	userId,
}: {
	orgId: string;
	userId: string;
}): Promise<ChatInstallation> => {
	const installation = await ensureWebInstallation({ orgId });
	const credential = await getChatOAuthCredentialByInstallationEnv({
		db,
		chatInstallationId: installation.id,
		env: AppEnv.Sandbox,
		orgId,
	});
	if (!credential) {
		await db.transaction((tx) =>
			replaceInstallationOAuthCredentials({ tx, installation, userId, orgId }),
		);
	}
	return installation;
};
