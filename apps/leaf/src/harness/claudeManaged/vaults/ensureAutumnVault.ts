import type Anthropic from "@anthropic-ai/sdk";
import {
	type AppEnv,
	type ChatProvider,
	chatInstallations,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import { getInstallationOAuthAccessToken } from "../../../internal/installations/actions/getInstallationOAuthAccessToken.js";
import { getChatOAuthCredentialByInstallationEnv } from "../../../internal/installations/repos/chatOAuthCredentialsRepo.js";
import { decrypt } from "../../../lib/crypto.js";
import { db } from "../../../lib/db.js";
import { env as chatEnv } from "../../../lib/env.js";
import { cmaRepo } from "../repos/claudeManagedRepo.js";

// CMA refreshes the OAuth token from its cloud, so the token endpoint must be a
// public HTTPS URL. In prod BETTER_AUTH_URL already is; in local dev it's
// http://localhost, so use the public autumn-server origin (the same NGROK tunnel
// MCP_SERVER_URL points at — it serves /api/auth alongside the /mcp proxy).
const tokenEndpoint = () => {
	const authBase =
		new URL(chatEnv.BETTER_AUTH_URL).protocol === "https:"
			? chatEnv.BETTER_AUTH_URL
			: new URL(chatEnv.MCP_SERVER_URL).origin;
	const endpoint = new URL("/api/auth/oauth2/token", authBase).href;
	if (new URL(endpoint).protocol !== "https:") {
		throw new Error(
			`The CMA vault OAuth token_endpoint must be HTTPS, but resolved to "${endpoint}". Set MCP_SERVER_URL to your public https tunnel (e.g. https://j.dev.useautumn.com).`,
		);
	}
	return endpoint;
};

// Mirrors the org's Autumn MCP OAuth credential into a CMA vault so Anthropic
// injects it after egress — the credential never enters the sandbox. Created
// once per (org, env); Anthropic auto-refreshes via the stored refresh token.
// NOTE: if Better Auth rotates the refresh token out-of-band, the vault copy goes
// stale and the next session reports an MCP auth error — re-seed by clearing the
// stored vault id. (Acceptable for v1; revisit if it bites.)
export const ensureAutumnVault = async ({
	client,
	env,
	orgId,
	provider,
	workspaceId,
}: {
	client: Anthropic;
	env: AppEnv;
	orgId: string;
	provider: string;
	workspaceId: string;
}): Promise<string> => {
	const existing = await cmaRepo.getVaultId({ db, env, orgId });
	if (existing) return existing;

	const installation = await db.query.chatInstallations.findFirst({
		where: and(
			eq(chatInstallations.org_id, orgId),
			eq(chatInstallations.provider, provider as ChatProvider),
			eq(chatInstallations.workspace_id, workspaceId),
		),
	});
	if (!installation) throw new Error("Chat installation not found for vault");

	// Refreshes + persists the access token, then read the row for the refresh token.
	const accessToken = await getInstallationOAuthAccessToken({
		installation,
		env,
	});
	const credential = await getChatOAuthCredentialByInstallationEnv({
		db,
		chatInstallationId: installation.id,
		env,
	});
	if (!credential) {
		throw new Error(`Missing ${env} Autumn OAuth credential for vault`);
	}

	const mcpServerUrl = new URL("/mcp", chatEnv.MCP_SERVER_URL).toString();
	const vault = await client.beta.vaults.create({
		display_name: `autumn/${orgId}/${env}`,
		metadata: { app: "leaf", env, orgId },
	});
	const created = await client.beta.vaults.credentials.create(vault.id, {
		display_name: `autumn-mcp/${orgId}/${env}`,
		auth: {
			type: "mcp_oauth",
			mcp_server_url: mcpServerUrl,
			access_token: accessToken,
			refresh: {
				client_id: credential.oauth_client_id,
				refresh_token: decrypt(credential.refresh_token),
				token_endpoint: tokenEndpoint(),
				token_endpoint_auth: { type: "none" },
			},
		},
	});
	await cmaRepo.upsertVault({
		credentialId: created.id,
		db,
		env,
		orgId,
		vaultId: vault.id,
	});
	return vault.id;
};
