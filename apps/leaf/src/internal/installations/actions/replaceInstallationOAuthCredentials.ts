import crypto from "node:crypto";
import { prefixOAuthToken } from "@autumn/auth";
import {
	AppEnv,
	type ChatInstallation,
	chatOAuthCredentials,
	oauthAccessToken,
	oauthClient,
	oauthConsent,
	oauthRefreshToken,
} from "@autumn/shared";
import { ALL_SCOPES } from "@autumn/shared/utils/scopeDefinitions";
import { and, eq } from "drizzle-orm";
import { encrypt } from "../../../lib/crypto.js";
import type { db } from "../../../lib/db.js";
import { AUTUMN_SLACK_OAUTH_CLIENT_ID } from "./upsertInstallationOAuthCredential.js";

type ChatTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;

const tokenHash = ({ token }: { token: string }) => {
	const hash = crypto.createHash("sha256").update(token).digest();
	return hash
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
};

const generateToken = () => crypto.randomBytes(48).toString("base64url");

const ensureSlackMcpOAuthClient = async ({ tx }: { tx: ChatTransaction }) => {
	const now = new Date();

	await tx
		.insert(oauthClient)
		.values({
			id: `oauth_client_${crypto.randomUUID().replace(/-/g, "")}`,
			clientId: AUTUMN_SLACK_OAUTH_CLIENT_ID,
			name: "Slack",
			redirectUris: ["slack://autumn-chat"],
			scopes: [...ALL_SCOPES],
			tokenEndpointAuthMethod: "none",
			grantTypes: ["authorization_code", "refresh_token"],
			responseTypes: ["code"],
			public: true,
			type: "native",
			metadata: {
				kind: "mcp_client",
				mcpClientType: "slack",
			},
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: oauthClient.clientId,
			set: {
				name: "Slack",
				scopes: [...ALL_SCOPES],
				tokenEndpointAuthMethod: "none",
				grantTypes: ["authorization_code", "refresh_token"],
				responseTypes: ["code"],
				public: true,
				type: "native",
				metadata: {
					kind: "mcp_client",
					mcpClientType: "slack",
				},
				updatedAt: now,
			},
		});
};

const upsertOAuthConsent = async ({
	tx,
	env,
	orgId,
	userId,
}: {
	tx: ChatTransaction;
	env: AppEnv;
	orgId: string;
	userId: string;
}) => {
	const now = new Date();
	const [existingConsent] = await tx
		.select({ id: oauthConsent.id })
		.from(oauthConsent)
		.where(
			and(
				eq(oauthConsent.clientId, AUTUMN_SLACK_OAUTH_CLIENT_ID),
				eq(oauthConsent.userId, userId),
				eq(oauthConsent.referenceId, orgId),
				eq(oauthConsent.env, env),
			),
		)
		.limit(1);

	if (existingConsent) {
		await tx
			.update(oauthConsent)
			.set({
				scopes: [...ALL_SCOPES],
				updatedAt: now,
			})
			.where(eq(oauthConsent.id, existingConsent.id));
		return existingConsent.id;
	}

	const consentId = `oauth_consent_${crypto.randomUUID().replace(/-/g, "")}`;
	await tx.insert(oauthConsent).values({
		id: consentId,
		clientId: AUTUMN_SLACK_OAUTH_CLIENT_ID,
		userId,
		referenceId: orgId,
		scopes: [...ALL_SCOPES],
		env,
		redirectUri: "slack://autumn-chat",
		createdAt: now,
		updatedAt: now,
	});

	return consentId;
};

const createCredentialForEnv = async ({
	tx,
	installation,
	env,
	userId,
}: {
	tx: ChatTransaction;
	installation: ChatInstallation;
	env: AppEnv;
	userId: string;
}) => {
	const now = Date.now();
	const nowDate = new Date(now);
	const rawAccessToken = generateToken();
	const rawRefreshToken = generateToken();
	const accessTokenExpiresAt = now + ACCESS_TOKEN_TTL_MS;
	const refreshTokenExpiresAt = now + REFRESH_TOKEN_TTL_MS;
	const refreshTokenId = `oauth_refresh_${crypto.randomUUID().replace(/-/g, "")}`;
	const accessTokenId = `oauth_access_${crypto.randomUUID().replace(/-/g, "")}`;
	const consentId = await upsertOAuthConsent({
		tx,
		env,
		orgId: installation.org_id,
		userId,
	});

	await tx.insert(oauthRefreshToken).values({
		id: refreshTokenId,
		token: tokenHash({ token: rawRefreshToken }),
		clientId: AUTUMN_SLACK_OAUTH_CLIENT_ID,
		userId,
		referenceId: installation.org_id,
		expiresAt: new Date(refreshTokenExpiresAt),
		createdAt: nowDate,
		authTime: nowDate,
		scopes: [...ALL_SCOPES],
	});
	await tx.insert(oauthAccessToken).values({
		id: accessTokenId,
		token: tokenHash({ token: rawAccessToken }),
		clientId: AUTUMN_SLACK_OAUTH_CLIENT_ID,
		userId,
		referenceId: installation.org_id,
		refreshId: refreshTokenId,
		expiresAt: new Date(accessTokenExpiresAt),
		createdAt: nowDate,
		scopes: [...ALL_SCOPES],
	});
	await tx.insert(chatOAuthCredentials).values({
		id: `chat_oauth_${crypto.randomUUID().replace(/-/g, "")}`,
		chat_installation_id: installation.id,
		org_id: installation.org_id,
		env,
		oauth_client_id: AUTUMN_SLACK_OAUTH_CLIENT_ID,
		oauth_consent_id: consentId,
		access_token: encrypt(prefixOAuthToken({ token: rawAccessToken })),
		refresh_token: encrypt(rawRefreshToken),
		access_token_expires_at: accessTokenExpiresAt,
		scopes: [...ALL_SCOPES],
		created_at: now,
		updated_at: now,
	});
};

export const replaceInstallationOAuthCredentials = async ({
	tx,
	installation,
	userId,
}: {
	tx: ChatTransaction;
	installation: ChatInstallation;
	userId: string;
}) => {
	if (!userId) {
		throw new Error("Missing user id for Slack MCP OAuth credentials");
	}

	await ensureSlackMcpOAuthClient({ tx });
	await createCredentialForEnv({
		tx,
		installation,
		env: AppEnv.Sandbox,
		userId,
	});
	await createCredentialForEnv({
		tx,
		installation,
		env: AppEnv.Live,
		userId,
	});
};
