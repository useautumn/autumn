import crypto, { randomUUID } from "node:crypto";
import { stripOAuthTokenPrefix } from "@autumn/auth";
import {
	AppEnv,
	apiKeys,
	type ChatOAuthCredential,
	chatInstallations,
	chatOAuthCredentials,
	createChatInstallState,
	ErrCode,
	oauthAccessToken,
	oauthConsent,
	oauthRefreshToken,
	organizations,
	RecaseError,
	Scopes,
	slackAdminThreads,
} from "@autumn/shared";
import { addMinutes } from "date-fns";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { hashOAuthToken } from "@/utils/oauthUtils.js";
import {
	createSlackInstallUrl,
	getChatStateSecret,
	getSlackAdminProvider,
} from "../chat/chatUtils.js";
import { clearSecretKeyCache } from "../dev/api-keys/cacheApiKeyUtils.js";

const targetBody = z.strictObject({
	org_id: z.string().min(1),
	env: z.enum(AppEnv),
});

const getSlackAdminInstallation = async ({ db }: { db: DrizzleCli }) =>
	db.query.chatInstallations.findFirst({
		where: eq(chatInstallations.provider, getSlackAdminProvider()),
	});

const getSlackAdminOAuthCredentials = async ({
	db,
	installationId,
}: {
	db: DrizzleCli;
	installationId: string;
}) =>
	db.query.chatOAuthCredentials.findMany({
		where: eq(chatOAuthCredentials.chat_installation_id, installationId),
	});

const getOrgSummary = async ({
	db,
	orgId,
}: {
	db: DrizzleCli;
	orgId: string;
}) =>
	db.query.organizations.findFirst({
		where: eq(organizations.id, orgId),
		columns: {
			id: true,
			name: true,
			slug: true,
		},
	});

const decryptChatCredentialToken = ({ token }: { token: string }) => {
	const key = crypto
		.createHash("sha256")
		.update(process.env.ENCRYPTION_PASSWORD ?? "")
		.digest();
	const buffer = Buffer.from(token, "base64");
	if (buffer[0] !== 1) throw new Error("Unsupported encrypted payload");
	const decipher = crypto.createDecipheriv(
		"aes-256-gcm",
		key,
		buffer.subarray(1, 13),
	);
	decipher.setAuthTag(buffer.subarray(13, 29));
	return Buffer.concat([
		decipher.update(buffer.subarray(29)),
		decipher.final(),
	]).toString("utf8");
};

const getStoredOAuthTokenValues = async ({
	token,
	stripPrefix = false,
}: {
	token: string;
	stripPrefix?: boolean;
}) => {
	const rawToken = stripPrefix ? stripOAuthTokenPrefix({ token }) : token;
	return [rawToken, await hashOAuthToken(rawToken)];
};

const revokeSlackAdminOAuthArtifacts = async ({
	db,
	credentials,
}: {
	db: Pick<DrizzleCli, "delete" | "select">;
	credentials: ChatOAuthCredential[];
}) => {
	const consentIds = [
		...new Set(
			credentials
				.map((credential) => credential.oauth_consent_id)
				.filter((id): id is string => Boolean(id)),
		),
	];

	if (consentIds.length > 0) {
		const accessTokenValues: string[] = [];
		const refreshTokenValues: string[] = [];
		for (const credential of credentials) {
			accessTokenValues.push(
				...(await getStoredOAuthTokenValues({
					token: decryptChatCredentialToken({ token: credential.access_token }),
					stripPrefix: true,
				})),
			);
			refreshTokenValues.push(
				...(await getStoredOAuthTokenValues({
					token: decryptChatCredentialToken({
						token: credential.refresh_token,
					}),
				})),
			);
		}

		const uniqueAccessTokenValues = [...new Set(accessTokenValues)];
		const uniqueRefreshTokenValues = [...new Set(refreshTokenValues)];
		if (uniqueAccessTokenValues.length > 0) {
			await db
				.delete(oauthAccessToken)
				.where(inArray(oauthAccessToken.token, uniqueAccessTokenValues));
		}
		if (uniqueRefreshTokenValues.length > 0) {
			await db
				.delete(oauthRefreshToken)
				.where(inArray(oauthRefreshToken.token, uniqueRefreshTokenValues));
		}

		for (const consentId of consentIds) {
			const linkedKeys = await db
				.select({ id: apiKeys.id, hashedKey: apiKeys.hashed_key })
				.from(apiKeys)
				.where(sql`${apiKeys.meta}->>'oauth_consent_id' = ${consentId}`);

			for (const key of linkedKeys) {
				await db.delete(apiKeys).where(eq(apiKeys.id, key.id));
				if (key.hashedKey)
					await clearSecretKeyCache({ hashedKey: key.hashedKey });
			}
		}

		await db.delete(oauthConsent).where(inArray(oauthConsent.id, consentIds));
	}

	const credentialIds = credentials.map((credential) => credential.id);
	if (credentialIds.length > 0) {
		await db
			.delete(chatOAuthCredentials)
			.where(inArray(chatOAuthCredentials.id, credentialIds));
	}
};

export const handleCreateSlackAdminInstall = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const state = createChatInstallState({
			secret: getChatStateSecret(),
			provider: getSlackAdminProvider(),
			orgId: ctx.org.id,
			userId: ctx.userId ?? "",
			env: ctx.env,
			expiresAt: addMinutes(Date.now(), 10).getTime(),
			nonce: randomUUID(),
		});

		return c.json({ url: createSlackInstallUrl(state) });
	},
});

export const handleGetSlackAdminInstall = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const { db } = c.get("ctx");
		const installation = await getSlackAdminInstallation({ db });
		const installOwnerOrg = installation
			? await getOrgSummary({ db, orgId: installation.org_id })
			: null;
		const oauthCredentials = installation
			? await getSlackAdminOAuthCredentials({
					db,
					installationId: installation.id,
				})
			: [];

		return c.json({
			installation: installation
				? {
						id: installation.id,
						workspace_id: installation.workspace_id,
						workspace_name: installation.workspace_name,
						bot_user_id: installation.bot_user_id,
						install_owner_org_id: installation.org_id,
						install_owner_org_name: installOwnerOrg?.name ?? null,
						install_owner_org_slug: installOwnerOrg?.slug ?? null,
						default_env: installation.default_env,
						updated_at: installation.updated_at,
						installed_by_user_id: installation.installed_by_user_id,
						oauth_credentials: oauthCredentials.map((credential) => ({
							id: credential.id,
							org_id: credential.org_id,
							env: credential.env,
							oauth_client_id: credential.oauth_client_id,
							oauth_consent_id: credential.oauth_consent_id,
							access_token_expires_at: credential.access_token_expires_at,
							updated_at: credential.updated_at,
						})),
					}
				: null,
		});
	},
});

export const handleUpdateSlackAdminTarget = createRoute({
	scopes: [Scopes.Superuser],
	body: targetBody,
	handler: async (c) => {
		c.req.valid("json");
		throw new RecaseError({
			message:
				"Slack admin targets are selected and locked per Slack thread. Start a Slack thread with an explicit org slug or ID.",
			code: ErrCode.InvalidRequest,
			statusCode: 410,
		});
	},
});

export const handleDeleteSlackAdminInstall = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const { db } = c.get("ctx");
		const installation = await getSlackAdminInstallation({ db });
		if (!installation) return c.json({ success: true });
		const oauthCredentials = await getSlackAdminOAuthCredentials({
			db,
			installationId: installation.id,
		});

		await db.transaction(async (tx) => {
			await revokeSlackAdminOAuthArtifacts({
				db: tx,
				credentials: oauthCredentials,
			});
			await tx
				.delete(slackAdminThreads)
				.where(eq(slackAdminThreads.chat_installation_id, installation.id));
			await tx
				.delete(chatInstallations)
				.where(
					and(
						eq(chatInstallations.id, installation.id),
						eq(chatInstallations.provider, getSlackAdminProvider()),
					),
				);
		});

		return c.json({ success: true });
	},
});
