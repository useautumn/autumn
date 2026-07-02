import crypto from "node:crypto";
import { prefixOAuthToken } from "@autumn/auth";
import {
	AppEnv,
	ChatAuthMode,
	type ChatInstallation,
	chatOAuthCredentials,
	DEFAULT_OAUTH_RESOURCE_SCOPES,
	oauthAccessToken,
	oauthClient,
	oauthConsent,
	oauthRefreshToken,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import { encrypt } from "../../../lib/crypto.js";
import type { db } from "../../../lib/db.js";
import { isSlackAdminProvider } from "../../slackAdmin/provider.js";
import { resolveAgentScopes } from "./chatOAuthCredentialScopes.js";
import {
	getOAuthConsentMetadata,
	getOAuthConsentMetadataKindFilter,
	type OAuthConsentMetadata,
} from "./oauthConsentMetadata.js";
import {
	AUTUMN_ADMIN_OAUTH_CLIENT_ID,
	AUTUMN_SLACK_OAUTH_CLIENT_ID,
	AUTUMN_WEB_OAUTH_CLIENT_ID,
} from "./upsertInstallationOAuthCredential.js";

export { resolveAgentScopes } from "./chatOAuthCredentialScopes.js";

type ChatTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const SLACK_OAUTH_REDIRECT_URI = "slack://autumn-chat";
// Programmatic provisioning never redirects, so this is only a stored value.
const WEB_OAUTH_REDIRECT_URI = "https://app.useautumn.com/chat";

type ProviderOAuthConfig = {
	clientId: string;
	name: string;
	mcpClientType: string;
	redirectUri: string;
};

/** MCP OAuth client config per chat provider (Slack scheme vs web origin). */
const getProviderOAuthConfig = ({
	installation,
}: {
	installation: ChatInstallation;
}): ProviderOAuthConfig => {
	if (isSlackAdminProvider({ provider: installation.provider })) {
		return {
			clientId: AUTUMN_ADMIN_OAUTH_CLIENT_ID,
			name: "Slack Admin",
			mcpClientType: "slack_admin",
			redirectUri: SLACK_OAUTH_REDIRECT_URI,
		};
	}
	if (installation.provider === "web") {
		return {
			clientId: AUTUMN_WEB_OAUTH_CLIENT_ID,
			name: "Dashboard",
			mcpClientType: "web",
			redirectUri: WEB_OAUTH_REDIRECT_URI,
		};
	}
	return {
		clientId: AUTUMN_SLACK_OAUTH_CLIENT_ID,
		name: "Slack",
		mcpClientType: "slack",
		redirectUri: SLACK_OAUTH_REDIRECT_URI,
	};
};

const tokenHash = ({ token }: { token: string }) => {
	const hash = crypto.createHash("sha256").update(token).digest();
	return hash
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
};

const generateToken = () => crypto.randomBytes(48).toString("base64url");

const ensureMcpOAuthClient = async ({
	tx,
	config,
}: {
	tx: ChatTransaction;
	config: ProviderOAuthConfig;
}) => {
	const now = new Date();
	const metadata = { kind: "mcp_client", mcpClientType: config.mcpClientType };

	await tx
		.insert(oauthClient)
		.values({
			id: `oauth_client_${crypto.randomUUID().replace(/-/g, "")}`,
			clientId: config.clientId,
			name: config.name,
			redirectUris: [config.redirectUri],
			scopes: [...DEFAULT_OAUTH_RESOURCE_SCOPES],
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
				name: config.name,
				scopes: [...DEFAULT_OAUTH_RESOURCE_SCOPES],
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
	config,
	metadata,
	scopes,
}: {
	tx: ChatTransaction;
	env: AppEnv;
	orgId: string;
	userId: string;
	config: ProviderOAuthConfig;
	metadata: OAuthConsentMetadata;
	scopes: string[];
}) => {
	const now = new Date();
	const [existingConsent] = await tx
		.select({ id: oauthConsent.id })
		.from(oauthConsent)
		.where(
			and(
				eq(oauthConsent.clientId, config.clientId),
				eq(oauthConsent.userId, userId),
				eq(oauthConsent.referenceId, orgId),
				eq(oauthConsent.env, env),
				getOAuthConsentMetadataKindFilter(metadata),
			),
		)
		.limit(1);

	if (existingConsent) {
		await tx
			.update(oauthConsent)
			.set({
				scopes,
				metadata,
				updatedAt: now,
			})
			.where(eq(oauthConsent.id, existingConsent.id));
		return existingConsent.id;
	}

	const consentId = `oauth_consent_${crypto.randomUUID().replace(/-/g, "")}`;
	await tx.insert(oauthConsent).values({
		id: consentId,
		clientId: config.clientId,
		userId,
		referenceId: orgId,
		scopes,
		env,
		redirectUri: config.redirectUri,
		metadata,
		createdAt: now,
		updatedAt: now,
	});

	return consentId;
};

const createCredentialForEnv = async ({
	tx,
	installation,
	config,
	authMode,
	env,
	orgId,
	userId,
	scopes,
}: {
	tx: ChatTransaction;
	installation: ChatInstallation;
	config: ProviderOAuthConfig;
	authMode?: ChatAuthMode;
	env: AppEnv;
	orgId: string;
	userId: string;
	scopes: string[];
}) => {
	const now = Date.now();
	const nowDate = new Date(now);
	const rawAccessToken = generateToken();
	const rawRefreshToken = generateToken();
	const accessTokenExpiresAt = now + ACCESS_TOKEN_TTL_MS;
	const refreshTokenExpiresAt = now + REFRESH_TOKEN_TTL_MS;
	const refreshTokenId = `oauth_refresh_${crypto.randomUUID().replace(/-/g, "")}`;
	const accessTokenId = `oauth_access_${crypto.randomUUID().replace(/-/g, "")}`;
	const metadata = getOAuthConsentMetadata({ authMode, installation, userId });
	const consentId = await upsertOAuthConsent({
		tx,
		env,
		orgId,
		userId,
		config,
		metadata,
		scopes,
	});

	await tx.insert(oauthRefreshToken).values({
		id: refreshTokenId,
		token: tokenHash({ token: rawRefreshToken }),
		clientId: config.clientId,
		userId,
		referenceId: orgId,
		oauthConsentId: consentId,
		expiresAt: new Date(refreshTokenExpiresAt),
		createdAt: nowDate,
		authTime: nowDate,
		scopes,
	});
	await tx.insert(oauthAccessToken).values({
		id: accessTokenId,
		token: tokenHash({ token: rawAccessToken }),
		clientId: config.clientId,
		userId,
		referenceId: orgId,
		oauthConsentId: consentId,
		refreshId: refreshTokenId,
		expiresAt: new Date(accessTokenExpiresAt),
		createdAt: nowDate,
		scopes,
	});
	const credential = {
		id: `chat_oauth_${crypto.randomUUID().replace(/-/g, "")}`,
		chat_installation_id: installation.id,
		org_id: orgId,
		user_id: userId,
		env,
		oauth_client_id: config.clientId,
		oauth_consent_id: consentId,
		access_token: encrypt(prefixOAuthToken({ token: rawAccessToken })),
		refresh_token: encrypt(rawRefreshToken),
		access_token_expires_at: accessTokenExpiresAt,
		refresh_token_expires_at: refreshTokenExpiresAt,
		scopes,
		created_at: now,
		updated_at: now,
	};

	await tx
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
		});
};

export const replaceInstallationOAuthCredentials = async ({
	tx,
	installation,
	userId,
	agentScopes,
	authMode,
	orgId = installation.org_id,
}: {
	tx: ChatTransaction;
	installation: ChatInstallation;
	userId: string;
	agentScopes?: string[];
	authMode?: ChatAuthMode;
	orgId?: string;
}) => {
	if (!userId) {
		throw new Error("Missing user id for chat MCP OAuth credentials");
	}
	const effectiveAuthMode = authMode ?? installation.auth_mode ?? undefined;

	// Unrestricted installs intentionally mint a scope-less token: the route scope
	// middleware treats empty scopes as full access, so every sender acts as admin.
	const scopes =
		effectiveAuthMode === ChatAuthMode.Unrestricted
			? []
			: resolveAgentScopes(agentScopes);
	const config = getProviderOAuthConfig({ installation });

	await ensureMcpOAuthClient({ tx, config });
	await createCredentialForEnv({
		tx,
		installation,
		config,
		authMode: effectiveAuthMode,
		env: AppEnv.Sandbox,
		orgId,
		userId,
		scopes,
	});
	await createCredentialForEnv({
		tx,
		installation,
		config,
		authMode: effectiveAuthMode,
		env: AppEnv.Live,
		orgId,
		userId,
		scopes,
	});
};
