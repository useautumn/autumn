import crypto from "node:crypto";
import {
	AppEnv,
	apiKeys,
	type ChatInstallation,
	type ChatProvider,
	chatInstallations,
	Scopes,
} from "@autumn/shared";
import type { ChatInstallState } from "@autumn/shared/utils/chatState";
import { and, eq, or } from "drizzle-orm";
import { decrypt, encrypt } from "../../lib/crypto.js";
import { db } from "../../lib/db.js";
import { env } from "../../lib/env.js";

const apiKeyScopes = [
	Scopes.Customers.Read,
	Scopes.Customers.Write,
	Scopes.Plans.Read,
	Scopes.Plans.Write,
	Scopes.Billing.Read,
	Scopes.Billing.Write,
	Scopes.Balances.Write,
];

const apiKeyPrefix = (env: AppEnv) =>
	env === AppEnv.Live ? "am_sk_live" : "am_sk_test";

export const getStateSecret = () => env.CHAT_STATE_SECRET;

export const findInstallation = (provider: ChatProvider, workspaceId: string) =>
	db.query.chatInstallations.findFirst({
		where: and(
			eq(chatInstallations.provider, provider),
			eq(chatInstallations.workspace_id, workspaceId),
		),
	});

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

const createApiKey = async ({
	orgId,
	userId,
	env,
	provider,
}: {
	orgId: string;
	userId: string;
	env: AppEnv;
	provider: ChatProvider;
}) => {
	const secret = `${apiKeyPrefix(env)}_${crypto.randomBytes(32).toString("base64url")}`;
	const key = {
		id: `key_${crypto.randomUUID().replace(/-/g, "")}`,
		org_id: orgId,
		user_id: userId,
		name: `Chat MCP (${provider})`,
		prefix: secret.substring(0, 14),
		created_at: Date.now(),
		env,
		hashed_key: crypto.createHash("sha256").update(secret).digest("hex"),
		meta: { created_via: "chat", provider },
		scopes: apiKeyScopes,
	};
	await db.insert(apiKeys).values(key);
	return { id: key.id, secret };
};

const deleteInstallationApiKeys = async (installation: ChatInstallation) => {
	for (const id of [
		installation.sandbox_api_key_id,
		installation.live_api_key_id,
	]) {
		if (!id) continue;
		await db
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
	installedByProviderUserId,
}: {
	state: ChatInstallState;
	provider: ChatProvider;
	workspaceId: string;
	workspaceName: string;
	botUserId?: string;
	botAccessToken: string;
	scopes: string[];
	installedByProviderUserId?: string;
}) => {
	const sandbox = await createApiKey({
		orgId: state.orgId,
		userId: state.userId,
		env: AppEnv.Sandbox,
		provider,
	});
	const live = await createApiKey({
		orgId: state.orgId,
		userId: state.userId,
		env: AppEnv.Live,
		provider,
	});

	const sameOrg = and(
		eq(chatInstallations.org_id, state.orgId),
		eq(chatInstallations.provider, provider),
	);
	const sameWorkspace = and(
		eq(chatInstallations.provider, provider),
		eq(chatInstallations.workspace_id, workspaceId),
	);
	const existingInstallations = await db.query.chatInstallations.findMany({
		where: or(sameOrg, sameWorkspace),
	});
	for (const installation of existingInstallations) {
		await deleteInstallationApiKeys(installation);
	}

	await db.delete(chatInstallations).where(or(sameOrg, sameWorkspace));
	await db.insert(chatInstallations).values({
		id: `chat_inst_${crypto.randomUUID().replace(/-/g, "")}`,
		org_id: state.orgId,
		provider,
		workspace_id: workspaceId,
		workspace_name: workspaceName,
		bot_user_id: botUserId,
		bot_access_token: encrypt(botAccessToken),
		scopes,
		default_env: state.env,
		sandbox_api_key_id: sandbox.id,
		sandbox_api_key: encrypt(sandbox.secret),
		live_api_key_id: live.id,
		live_api_key: encrypt(live.secret),
		installed_by_user_id: state.userId,
		installed_by_provider_user_id: installedByProviderUserId,
		created_at: Date.now(),
		updated_at: Date.now(),
	});
};
