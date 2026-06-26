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
	userId,
}: {
	db: ChatDb;
	chatInstallationId: string;
	env: AppEnv;
	orgId?: string;
	// Web chat credentials are per-user; always pass userId there. Slack omits it
	// (one installation-scoped credential per install).
	userId?: string;
}) =>
	db.query.chatOAuthCredentials.findFirst({
		where: and(
			eq(chatOAuthCredentials.chat_installation_id, chatInstallationId),
			eq(chatOAuthCredentials.env, env),
			orgId ? eq(chatOAuthCredentials.org_id, orgId) : undefined,
			userId ? eq(chatOAuthCredentials.user_id, userId) : undefined,
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
				chatOAuthCredentials.user_id,
			],
			set: {
				org_id: credential.org_id,
				oauth_client_id: credential.oauth_client_id,
				oauth_consent_id: credential.oauth_consent_id,
				access_token: credential.access_token,
				refresh_token: credential.refresh_token,
				access_token_expires_at: credential.access_token_expires_at,
				refresh_token_expires_at: credential.refresh_token_expires_at,
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
	refreshTokenExpiresAt,
	scopes,
	updatedAt,
}: {
	db: ChatDb;
	id: string;
	accessToken: string;
	refreshToken: string;
	accessTokenExpiresAt: number;
	refreshTokenExpiresAt?: number;
	scopes: string[];
	updatedAt: number;
}) => {
	const [row] = await db
		.update(chatOAuthCredentials)
		.set({
			access_token: accessToken,
			refresh_token: refreshToken,
			access_token_expires_at: accessTokenExpiresAt,
			...(refreshTokenExpiresAt !== undefined
				? { refresh_token_expires_at: refreshTokenExpiresAt }
				: {}),
			scopes,
			updated_at: updatedAt,
		})
		.where(eq(chatOAuthCredentials.id, id))
		.returning();

	return row as ChatOAuthCredential | undefined;
};
