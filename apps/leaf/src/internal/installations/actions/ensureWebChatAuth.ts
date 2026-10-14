import crypto from "node:crypto";
import {
	AppEnv,
	type ChatInstallation,
	chatInstallations,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import { db } from "../../../lib/db.js";
import { ensureChatUserCredential } from "./ensureChatUserCredential.js";

export const WEB_CHAT_PROVIDER = "web" as const;

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
	const row = await db.query.chatInstallations.findFirst({ where });
	if (!row) {
		throw new Error("Failed to ensure web chat installation");
	}
	return row;
};

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
	await ensureChatUserCredential({ installation, orgId, userId, userScopes });
	return installation;
};
