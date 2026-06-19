import {
	type AppEnv,
	type ChatOAuthCredential,
	chatOAuthCredentials,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

export type ChatOAuthCredentialInsert =
	typeof chatOAuthCredentials.$inferInsert;

export const getChatOAuthCredentialByInstallationEnv = async ({
	db,
	chatInstallationId,
	env,
	orgId,
}: {
	db: ChatDb;
	chatInstallationId: string;
	env: AppEnv;
	orgId?: string;
}) =>
	db.query.chatOAuthCredentials.findFirst({
		where: and(
			eq(chatOAuthCredentials.chat_installation_id, chatInstallationId),
			eq(chatOAuthCredentials.env, env),
			orgId ? eq(chatOAuthCredentials.org_id, orgId) : undefined,
		),
	});

export const upsertChatOAuthCredential = async ({
	db,
	credential,
}: {
	db: ChatDb;
	credential: ChatOAuthCredentialInsert;
}) => {
	const [row] = await db
		.insert(chatOAuthCredentials)
		.values(credential)
		.onConflictDoUpdate({
			target: [
				chatOAuthCredentials.chat_installation_id,
				chatOAuthCredentials.org_id,
				chatOAuthCredentials.env,
			],
			set: {
				org_id: credential.org_id,
				oauth_client_id: credential.oauth_client_id,
				oauth_consent_id: credential.oauth_consent_id,
				access_token: credential.access_token,
				refresh_token: credential.refresh_token,
				access_token_expires_at: credential.access_token_expires_at,
				scopes: credential.scopes,
				updated_at: credential.updated_at,
			},
		})
		.returning();

	return row as ChatOAuthCredential;
};

export const updateChatOAuthCredentialTokens = async ({
	db,
	id,
	accessToken,
	refreshToken,
	accessTokenExpiresAt,
	scopes,
	updatedAt,
}: {
	db: ChatDb;
	id: string;
	accessToken: string;
	refreshToken: string;
	accessTokenExpiresAt: number;
	scopes: string[];
	updatedAt: number;
}) => {
	const [row] = await db
		.update(chatOAuthCredentials)
		.set({
			access_token: accessToken,
			refresh_token: refreshToken,
			access_token_expires_at: accessTokenExpiresAt,
			scopes,
			updated_at: updatedAt,
		})
		.where(eq(chatOAuthCredentials.id, id))
		.returning();

	return row as ChatOAuthCredential | undefined;
};
