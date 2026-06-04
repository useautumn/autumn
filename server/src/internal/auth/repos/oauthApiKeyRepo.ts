import { type AppEnv, apiKeys } from "@autumn/shared";
import { eq, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { clearSecretKeyCache } from "@/internal/dev/api-keys/cacheApiKeyUtils.js";

type OAuthApiKeyRecord = {
	id: string;
	orgId: string | null;
	userId: string | null;
	env: string | null;
	hashedKey: string | null;
	meta: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export const isOAuthConsentLinkedApiKey = ({
	apiKey,
	consentId,
	clientId,
	redirectUri,
	orgId,
	userId,
	env,
}: {
	apiKey: OAuthApiKeyRecord;
	consentId: string;
	clientId: string;
	redirectUri: string | null;
	orgId: string;
	userId: string;
	env: AppEnv;
}) => {
	if (
		apiKey.orgId !== orgId ||
		apiKey.userId !== userId ||
		apiKey.env !== env ||
		!isRecord(apiKey.meta)
	) {
		return false;
	}

	return (
		apiKey.meta.created_via === "oauth" &&
		apiKey.meta.oauth_consent_id === consentId &&
		apiKey.meta.oauth_client_id === clientId &&
		apiKey.meta.oauth_redirect_uri === redirectUri &&
		apiKey.meta.env === env
	);
};

export const deleteOAuthConsentLinkedApiKey = async ({
	db,
	apiKeyId,
	consentId,
	clientId,
	redirectUri,
	orgId,
	userId,
	env,
}: {
	db: DrizzleCli;
	apiKeyId: string;
	consentId: string;
	clientId: string;
	redirectUri: string | null;
	orgId: string;
	userId: string;
	env: AppEnv;
}) => {
	const [apiKey] = await db
		.select({
			id: apiKeys.id,
			orgId: apiKeys.org_id,
			userId: apiKeys.user_id,
			env: apiKeys.env,
			hashedKey: apiKeys.hashed_key,
			meta: apiKeys.meta,
		})
		.from(apiKeys)
		.where(eq(apiKeys.id, apiKeyId))
		.limit(1);

	if (!apiKey) return { deleted: false, reason: "not_found" as const };

	if (
		!isOAuthConsentLinkedApiKey({
			apiKey,
			consentId,
			clientId,
			redirectUri,
			orgId,
			userId,
			env,
		})
	) {
		return { deleted: false, reason: "guard_failed" as const };
	}

	await db.delete(apiKeys).where(eq(apiKeys.id, apiKeyId));

	if (apiKey.hashedKey)
		await clearSecretKeyCache({ hashedKey: apiKey.hashedKey });

	return { deleted: true, reason: null };
};

export const listOAuthApiKeysByConsentId = async ({
	db,
	consentId,
}: {
	db: DrizzleCli;
	consentId: string;
}) =>
	db
		.select({
			id: apiKeys.id,
			prefix: apiKeys.prefix,
			env: apiKeys.env,
			name: apiKeys.name,
			hashed_key: apiKeys.hashed_key,
		})
		.from(apiKeys)
		.where(sql`${apiKeys.meta}->>'oauth_consent_id' = ${consentId}`);

export const deleteOAuthApiKeyById = async ({
	db,
	apiKeyId,
}: {
	db: DrizzleCli;
	apiKeyId: string;
}) => db.delete(apiKeys).where(eq(apiKeys.id, apiKeyId));

export const getApiKeyIdByHashedKey = async ({
	db,
	hashedKey,
}: {
	db: DrizzleCli;
	hashedKey: string;
}) => {
	const [keyRecord] = await db
		.select({ id: apiKeys.id })
		.from(apiKeys)
		.where(eq(apiKeys.hashed_key, hashedKey))
		.limit(1);

	return keyRecord?.id ?? null;
};

export const oauthApiKeyRepo = {
	listByConsentId: listOAuthApiKeysByConsentId,
	deleteById: deleteOAuthApiKeyById,
	deleteConsentLinked: deleteOAuthConsentLinkedApiKey,
	getIdByHashedKey: getApiKeyIdByHashedKey,
};
