import crypto from "node:crypto";
import { stripOAuthTokenPrefix } from "@autumn/auth";
import {
	AppEnv,
	apiKeys,
	type ChatAuthMode,
	type ChatInstallation,
	type ChatInstallState,
	type ChatProvider,
	chatInstallations,
	chatOAuthCredentials,
	oauthAccessToken,
	oauthRefreshToken,
	organizations,
} from "@autumn/shared";
import { and, eq, inArray, or } from "drizzle-orm";
import { chatThreadContextsRepo } from "../../internal/chatThreadContexts/repos/chatThreadContextsRepo.js";
import { replaceInstallationOAuthCredentials } from "../../internal/installations/actions/replaceInstallationOAuthCredentials.js";
import { decrypt, encrypt } from "../../lib/crypto.js";
import { db } from "../../lib/db.js";
import { env } from "../../lib/env.js";

type ChatTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const getStateSecret = () => env.CHAT_STATE_SECRET;

export const findInstallation = (provider: ChatProvider, workspaceId: string) =>
	db.query.chatInstallations.findFirst({
		where: and(
			eq(chatInstallations.provider, provider),
			eq(chatInstallations.workspace_id, workspaceId),
		),
	});

export type ChatInstallationWithOrg = ChatInstallation & {
	org_slug?: string;
};

export const findInstallationWithOrg = async (
	provider: ChatProvider,
	workspaceId: string,
): Promise<ChatInstallationWithOrg | undefined> => {
	const [row] = await db
		.select({
			installation: chatInstallations,
			orgSlug: organizations.slug,
		})
		.from(chatInstallations)
		.innerJoin(organizations, eq(organizations.id, chatInstallations.org_id))
		.where(
			and(
				eq(chatInstallations.provider, provider),
				eq(chatInstallations.workspace_id, workspaceId),
			),
		)
		.limit(1);

	return row
		? {
				...row.installation,
				org_slug: row.orgSlug,
			}
		: undefined;
};

export const getInstallationKey = (
	installation: ChatInstallation,
	env: AppEnv,
) => {
	const key =
		env === AppEnv.Live
			? installation.live_api_key
			: installation.sandbox_api_key;
	if (!key) throw new Error(`Missing ${env} API key`);
	return decrypt(key);
};

const deleteInstallationArtifacts = async (
	tx: ChatTransaction,
	installation: ChatInstallation,
) => {
	const credentials = await tx.query.chatOAuthCredentials.findMany({
		where: eq(chatOAuthCredentials.chat_installation_id, installation.id),
	});
	const tokenHash = ({ token }: { token: string }) =>
		crypto.createHash("sha256").update(token).digest("base64url");
	const accessTokenHashes = credentials.map((credential) =>
		tokenHash({
			token: stripOAuthTokenPrefix({
				token: decrypt(credential.access_token),
			}),
		}),
	);
	const refreshTokenHashes = credentials.map((credential) =>
		tokenHash({ token: decrypt(credential.refresh_token) }),
	);

	if (accessTokenHashes.length > 0) {
		await tx
			.delete(oauthAccessToken)
			.where(inArray(oauthAccessToken.token, accessTokenHashes));
	}
	if (refreshTokenHashes.length > 0) {
		await tx
			.delete(oauthRefreshToken)
			.where(inArray(oauthRefreshToken.token, refreshTokenHashes));
	}
	await chatThreadContextsRepo.deleteByInstallation({
		db: tx,
		chatInstallationId: installation.id,
	});
	for (const id of [
		installation.sandbox_api_key_id,
		installation.live_api_key_id,
	]) {
		if (!id) continue;
		await tx
			.delete(apiKeys)
			.where(and(eq(apiKeys.id, id), eq(apiKeys.org_id, installation.org_id)));
	}
};

export const replaceInstallation = async ({
	state,
	provider,
	workspaceId,
	workspaceName,
	botUserId,
	botAccessToken,
	scopes,
	agentScopes,
	authMode,
	installedByProviderUserId,
}: {
	state: ChatInstallState;
	provider: ChatProvider;
	workspaceId: string;
	workspaceName: string;
	botUserId?: string;
	botAccessToken: string;
	scopes: string[];
	agentScopes?: string[];
	authMode?: ChatAuthMode;
	installedByProviderUserId?: string;
}) => {
	const sameOrg = and(
		eq(chatInstallations.org_id, state.orgId),
		eq(chatInstallations.provider, provider),
	);
	const sameWorkspace = and(
		eq(chatInstallations.provider, provider),
		eq(chatInstallations.workspace_id, workspaceId),
	);

	await db.transaction(async (tx) => {
		const existingInstallations = await tx.query.chatInstallations.findMany({
			where: or(sameOrg, sameWorkspace),
		});
		for (const installation of existingInstallations) {
			await deleteInstallationArtifacts(tx, installation);
		}

		await tx.delete(chatInstallations).where(or(sameOrg, sameWorkspace));
		const [installation] = await tx
			.insert(chatInstallations)
			.values({
				id: `chat_inst_${crypto.randomUUID().replace(/-/g, "")}`,
				org_id: state.orgId,
				provider,
				workspace_id: workspaceId,
				workspace_name: workspaceName,
				bot_user_id: botUserId,
				bot_access_token: encrypt(botAccessToken),
				scopes,
				auth_mode: authMode,
				default_env: state.env,
				installed_by_user_id: state.userId,
				installed_by_provider_user_id: installedByProviderUserId,
				created_at: Date.now(),
				updated_at: Date.now(),
			})
			.returning();

		await replaceInstallationOAuthCredentials({
			tx,
			installation,
			userId: state.userId,
			agentScopes,
		});
	});
};
