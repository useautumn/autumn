import type Anthropic from "@anthropic-ai/sdk";
import type { AppEnv } from "@autumn/shared";
import { getOrgInstallationToken } from "../../../internal/installations/actions/getOrgInstallationToken.js";
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

export const isCmaVaultStale = ({
	credentialUpdatedAt,
	currentMcpServerUrl,
	storedMcpServerUrl,
	vaultUpdatedAt,
}: {
	credentialUpdatedAt: number;
	currentMcpServerUrl?: string;
	storedMcpServerUrl?: string | null;
	vaultUpdatedAt?: number | null;
}) =>
	!vaultUpdatedAt ||
	credentialUpdatedAt > vaultUpdatedAt ||
	(currentMcpServerUrl !== undefined &&
		storedMcpServerUrl !== currentMcpServerUrl);

const buildCredentialAuth = ({
	accessToken,
	credential,
	mcpServerUrl,
}: {
	accessToken: string;
	credential: NonNullable<
		Awaited<ReturnType<typeof getChatOAuthCredentialByInstallationEnv>>
	>;
	mcpServerUrl: string;
}) => ({
	type: "mcp_oauth" as const,
	mcp_server_url: mcpServerUrl,
	access_token: accessToken,
	refresh: {
		client_id: credential.oauth_client_id,
		refresh_token: decrypt(credential.refresh_token),
		token_endpoint: tokenEndpoint(),
		token_endpoint_auth: { type: "none" as const },
	},
});

const vaultScope = ({ orgId, userId }: { orgId: string; userId: string }) =>
	userId ? `${orgId}/${userId}` : orgId;

const createVaultCredential = ({
	accessToken,
	credential,
	env,
	mcpServerUrl,
	orgId,
	userId,
	vaultId,
	client,
}: {
	accessToken: string;
	credential: NonNullable<
		Awaited<ReturnType<typeof getChatOAuthCredentialByInstallationEnv>>
	>;
	env: AppEnv;
	mcpServerUrl: string;
	orgId: string;
	userId: string;
	vaultId: string;
	client: Anthropic;
}) =>
	client.beta.vaults.credentials.create(vaultId, {
		display_name: `autumn-mcp/${vaultScope({ orgId, userId })}/${env}`,
		auth: buildCredentialAuth({ accessToken, credential, mcpServerUrl }),
		metadata: {
			credential_updated_at: String(credential.updated_at),
		},
	});

const getVaultCredentialMcpServerUrl = async ({
	client,
	credentialId,
	vaultId,
}: {
	client: Anthropic;
	credentialId: string;
	vaultId: string;
}) => {
	try {
		const credential = await client.beta.vaults.credentials.retrieve(
			credentialId,
			{ vault_id: vaultId },
		);
		if (credential.archived_at || credential.auth.type !== "mcp_oauth") {
			return undefined;
		}
		return credential.auth.mcp_server_url;
	} catch {
		return undefined;
	}
};

// Mirrors the org's Autumn MCP OAuth credential into a CMA vault so Anthropic
// injects it after egress. Resync when our local OAuth credential rotates.
export const ensureAutumnVault = async ({
	client,
	env,
	orgId,
	provider,
	workspaceId,
	userId,
}: {
	client: Anthropic;
	env: AppEnv;
	orgId: string;
	provider: string;
	workspaceId: string;
	// Web chat scopes the vault + credential per user; Slack omits it ("").
	userId?: string;
}): Promise<string> => {
	const vaultUserId = userId ?? "";
	const { accessToken, installation } = await getOrgInstallationToken({
		env,
		orgId,
		provider,
		workspaceId,
		userId,
	});
	const credential = await getChatOAuthCredentialByInstallationEnv({
		db,
		chatInstallationId: installation.id,
		env,
		orgId,
		userId,
	});
	if (!credential) {
		throw new Error(`Missing ${env} Autumn OAuth credential for vault`);
	}

	const mcpServerUrl = new URL("/mcp", chatEnv.MCP_SERVER_URL).toString();
	const existing = await cmaRepo.getVault({
		chatInstallationId: installation.id,
		db,
		env,
		orgId,
		userId: vaultUserId,
	});
	const storedMcpServerUrl = existing
		? await getVaultCredentialMcpServerUrl({
				client,
				credentialId: existing.credential_id,
				vaultId: existing.vault_id,
			})
		: undefined;
	if (
		existing &&
		!isCmaVaultStale({
			credentialUpdatedAt: credential.updated_at,
			currentMcpServerUrl: mcpServerUrl,
			storedMcpServerUrl,
			vaultUpdatedAt: existing.updated_at,
		})
	) {
		return existing.vault_id;
	}

	const auth = buildCredentialAuth({ accessToken, credential, mcpServerUrl });
	if (existing) {
		if (storedMcpServerUrl !== mcpServerUrl) {
			await client.beta.vaults.credentials
				.delete(existing.credential_id, { vault_id: existing.vault_id })
				.catch(() => undefined);
			const created = await createVaultCredential({
				accessToken,
				client,
				credential,
				env,
				mcpServerUrl,
				orgId,
				userId: vaultUserId,
				vaultId: existing.vault_id,
			});
			await cmaRepo.upsertVault({
				chatInstallationId: installation.id,
				credentialId: created.id,
				db,
				env,
				orgId,
				userId: vaultUserId,
				vaultId: existing.vault_id,
			});
			return existing.vault_id;
		}
		const updated = await client.beta.vaults.credentials.update(
			existing.credential_id,
			{
				vault_id: existing.vault_id,
				auth: {
					type: "mcp_oauth",
					access_token: auth.access_token,
					refresh: {
						refresh_token: auth.refresh.refresh_token,
						scope: credential.scopes.join(" "),
					},
				},
				metadata: {
					credential_updated_at: String(credential.updated_at),
				},
			},
		);
		await cmaRepo.upsertVault({
			chatInstallationId: installation.id,
			credentialId: updated.id,
			db,
			env,
			orgId,
			userId: vaultUserId,
			vaultId: existing.vault_id,
		});
		return existing.vault_id;
	}

	const vault = await client.beta.vaults.create({
		display_name: `autumn/${vaultScope({ orgId, userId: vaultUserId })}/${env}`,
		metadata: { app: "leaf", env, orgId, userId: vaultUserId },
	});
	const created = await createVaultCredential({
		accessToken,
		client,
		credential,
		env,
		mcpServerUrl,
		orgId,
		userId: vaultUserId,
		vaultId: vault.id,
	});
	await cmaRepo.upsertVault({
		chatInstallationId: installation.id,
		credentialId: created.id,
		db,
		env,
		orgId,
		userId: vaultUserId,
		vaultId: vault.id,
	});
	return vault.id;
};
