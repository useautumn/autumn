import crypto from "node:crypto";
import {
	AppEnv,
	apiKeys,
	type ChatInstallation,
	type ChatInstallState,
	type ChatProvider,
	chatInstallations,
	organizations,
} from "@autumn/shared";
import { and, eq, or } from "drizzle-orm";
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

const deleteInstallationApiKeys = async (
	tx: ChatTransaction,
	installation: ChatInstallation,
) => {
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
			await deleteInstallationApiKeys(tx, installation);
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
