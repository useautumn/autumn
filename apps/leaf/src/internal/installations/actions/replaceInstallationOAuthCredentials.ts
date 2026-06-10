import crypto from "node:crypto";
import { prefixOAuthToken } from "@autumn/auth";
import {
	AppEnv,
	type ChatInstallation,
	chatOAuthCredentials,
	LEAF_OAUTH_SCOPES,
	oauthAccessToken,
	oauthClient,
	oauthConsent,
	oauthRefreshToken,
} from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import { encrypt } from "../../../lib/crypto.js";
import type { db } from "../../../lib/db.js";
import {
	AUTUMN_ADMIN_OAUTH_CLIENT_ID,
	AUTUMN_SLACK_OAUTH_CLIENT_ID,
} from "./upsertInstallationOAuthCredential.js";

type ChatTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const SLACK_ADMIN_CONSENT_KIND = "slack_admin";

type OAuthConsentMetadata =
	| {
			kind: typeof SLACK_ADMIN_CONSENT_KIND;
			chatInstallationId: string;
			createdByUserId: string;
	  }
	| Record<string, never>;

const isSlackAdminInstallation = ({
	installation,
}: {
	installation: ChatInstallation;
}) => installation.provider.startsWith("slack_admin");

const getSlackMcpOAuthClientId = ({
	installation,
}: {
	installation: ChatInstallation;
}) =>
	isSlackAdminInstallation({ installation })
		? AUTUMN_ADMIN_OAUTH_CLIENT_ID
		: AUTUMN_SLACK_OAUTH_CLIENT_ID;

const getSlackMcpOAuthClientName = ({
	installation,
}: {
	installation: ChatInstallation;
}) => (isSlackAdminInstallation({ installation }) ? "Slack Admin" : "Slack");

const getOAuthClientMetadata = ({
	installation,
}: {
	installation: ChatInstallation;
}) => ({
	kind: "mcp_client",
	mcpClientType: isSlackAdminInstallation({ installation })
		? "slack_admin"
		: "slack",
});

const getOAuthConsentMetadata = ({
	installation,
	userId,
}: {
	installation: ChatInstallation;
	userId: string;
}): OAuthConsentMetadata =>
	isSlackAdminInstallation({ installation })
		? {
				kind: SLACK_ADMIN_CONSENT_KIND,
				chatInstallationId: installation.id,
				createdByUserId: userId,
			}
		: {};

const tokenHash = ({ token }: { token: string }) => {
	const hash = crypto.createHash("sha256").update(token).digest();
	return hash
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
};

const generateToken = () => crypto.randomBytes(48).toString("base64url");

const ensureSlackMcpOAuthClient = async ({
	tx,
	installation,
}: {
	tx: ChatTransaction;
	installation: ChatInstallation;
}) => {
	const now = new Date();
	const clientId = getSlackMcpOAuthClientId({ installation });
	const name = getSlackMcpOAuthClientName({ installation });
	const metadata = getOAuthClientMetadata({ installation });

	await tx
		.insert(oauthClient)
		.values({
			id: `oauth_client_${crypto.randomUUID().replace(/-/g, "")}`,
			clientId,
			name,
			redirectUris: ["slack://autumn-chat"],
			scopes: [...LEAF_OAUTH_SCOPES],
			tokenEndpointAuthMethod: "none",
			grantTypes: ["authorization_code", "refresh_token"],
			responseTypes: ["code"],
			public: true,
			type: "native",
			metadata,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: oauthClient.clientId,
			set: {
				name,
				scopes: [...LEAF_OAUTH_SCOPES],
				tokenEndpointAuthMethod: "none",
				grantTypes: ["authorization_code", "refresh_token"],
				responseTypes: ["code"],
				public: true,
				type: "native",
				metadata,
				updatedAt: now,
			},
		});
};

const upsertOAuthConsent = async ({
	tx,
	env,
	orgId,
	userId,
	clientId,
	metadata,
}: {
	tx: ChatTransaction;
	env: AppEnv;
	orgId: string;
	userId: string;
	clientId: string;
	metadata: OAuthConsentMetadata;
}) => {
	const now = new Date();
	const [existingConsent] = await tx
		.select({ id: oauthConsent.id })
		.from(oauthConsent)
		.where(
			and(
				eq(oauthConsent.clientId, clientId),
				eq(oauthConsent.userId, userId),
				eq(oauthConsent.referenceId, orgId),
				eq(oauthConsent.env, env),
				metadata?.kind === SLACK_ADMIN_CONSENT_KIND
					? sql`${oauthConsent.metadata}->>'kind' = ${SLACK_ADMIN_CONSENT_KIND}`
					: sql`COALESCE(${oauthConsent.metadata}->>'kind', '') != ${SLACK_ADMIN_CONSENT_KIND}`,
			),
		)
		.limit(1);

	if (existingConsent) {
		await tx
			.update(oauthConsent)
			.set({
				scopes: [...LEAF_OAUTH_SCOPES],
				metadata,
				updatedAt: now,
			})
			.where(eq(oauthConsent.id, existingConsent.id));
		return existingConsent.id;
	}

	const consentId = `oauth_consent_${crypto.randomUUID().replace(/-/g, "")}`;
	await tx.insert(oauthConsent).values({
		id: consentId,
		clientId,
		userId,
		referenceId: orgId,
		scopes: [...LEAF_OAUTH_SCOPES],
		env,
		redirectUri: "slack://autumn-chat",
		metadata,
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
	const clientId = getSlackMcpOAuthClientId({ installation });
	const metadata = getOAuthConsentMetadata({ installation, userId });
	const consentId = await upsertOAuthConsent({
		tx,
		env,
		orgId: installation.org_id,
		userId,
		clientId,
		metadata,
	});

	await tx.insert(oauthRefreshToken).values({
		id: refreshTokenId,
		token: tokenHash({ token: rawRefreshToken }),
		clientId,
		userId,
		referenceId: installation.org_id,
		expiresAt: new Date(refreshTokenExpiresAt),
		createdAt: nowDate,
		authTime: nowDate,
		scopes: [...LEAF_OAUTH_SCOPES],
	});
	await tx.insert(oauthAccessToken).values({
		id: accessTokenId,
		token: tokenHash({ token: rawAccessToken }),
		clientId,
		userId,
		referenceId: installation.org_id,
		refreshId: refreshTokenId,
		expiresAt: new Date(accessTokenExpiresAt),
		createdAt: nowDate,
		scopes: [...LEAF_OAUTH_SCOPES],
	});
	const credential = {
		id: `chat_oauth_${crypto.randomUUID().replace(/-/g, "")}`,
		chat_installation_id: installation.id,
		org_id: installation.org_id,
		env,
		oauth_client_id: clientId,
		oauth_consent_id: consentId,
		access_token: encrypt(prefixOAuthToken({ token: rawAccessToken })),
		refresh_token: encrypt(rawRefreshToken),
		access_token_expires_at: accessTokenExpiresAt,
		scopes: [...LEAF_OAUTH_SCOPES],
		created_at: now,
		updated_at: now,
	};

	await tx
		.insert(chatOAuthCredentials)
		.values(credential)
		.onConflictDoUpdate({
			target: [
				chatOAuthCredentials.chat_installation_id,
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

	await ensureSlackMcpOAuthClient({ tx, installation });
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
