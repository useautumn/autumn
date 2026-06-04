import { apiKeys } from "@autumn/shared";
import { eq, or, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { hashApiKey } from "@/internal/dev/api-keys/apiKeyUtils.js";
import { clearSecretKeyCache } from "@/internal/dev/api-keys/cacheApiKeyUtils.js";

export const deleteOAuthLinkedApiKey = async ({
	db,
	apiKeyId,
	apiKey,
}: {
	db: DrizzleCli;
	apiKeyId: string | null;
	apiKey: string | null;
}) => {
	const hashedKey = apiKey ? hashApiKey(apiKey) : null;
	const conditions = [
		apiKeyId ? eq(apiKeys.id, apiKeyId) : null,
		hashedKey ? eq(apiKeys.hashed_key, hashedKey) : null,
	].filter((condition) => condition !== null);

	if (conditions.length > 0) {
		await db.delete(apiKeys).where(or(...conditions));
	}

	if (hashedKey) {
		await clearSecretKeyCache({ hashedKey });
	}
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

export const updateOAuthLinkedApiKeyScopes = async ({
	db,
	apiKeyId,
	apiKey,
	scopes,
	name,
}: {
	db: DrizzleCli;
	apiKeyId: string | null;
	apiKey: string;
	scopes: string[];
	name: string;
}) => {
	const hashedKey = hashApiKey(apiKey);
	const conditions = [
		apiKeyId ? eq(apiKeys.id, apiKeyId) : null,
		eq(apiKeys.hashed_key, hashedKey),
	].filter((condition) => condition !== null);

	const [updatedKey] = await db
		.update(apiKeys)
		.set({ name, scopes })
		.where(or(...conditions))
		.returning({ id: apiKeys.id });

	return updatedKey?.id ?? null;
};

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
	deleteLinked: deleteOAuthLinkedApiKey,
	updateLinkedScopes: updateOAuthLinkedApiKeyScopes,
	getIdByHashedKey: getApiKeyIdByHashedKey,
};
