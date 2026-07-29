import { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { ApiKeyVerificationData } from "../../repos/getApiKeyVerificationData.js";
import { apiKeyRepo } from "../../repos/index.js";
import { ApiKeyPrefix, hashApiKey } from "../apiKeyUtils.js";
import {
	getCachedSecretKeyVerification,
	setCachedSecretKeyVerification,
} from "../cacheApiKeyUtils.js";

export const verifyKey = async ({
	db,
	key,
}: {
	db: DrizzleCli;
	key: string;
}): Promise<ApiKeyVerificationData | null> => {
	const hashedKey = hashApiKey(key);

	const env = key.startsWith(ApiKeyPrefix.Sandbox)
		? AppEnv.Sandbox
		: AppEnv.Live;

	const cached = await getCachedSecretKeyVerification({ hashedKey });

	if (cached) {
		// Backfill `pendingMigrations` on payloads cached before the field
		// existed — guarantees consumers can rely on the shape.
		const pendingMigrations = cached.pendingMigrations ?? [];
		return {
			...cached,
			pendingMigrations,
			org: { ...cached.org, pendingMigrations },
		};
	}

	const data = await apiKeyRepo.getVerificationData({ db, hashedKey, env });
	if (!data) return null;

	await setCachedSecretKeyVerification({ hashedKey, data });
	return data;
};
