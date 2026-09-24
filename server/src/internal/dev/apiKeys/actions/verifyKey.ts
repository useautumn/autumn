import { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	getCachedSecretKeyVerification,
	setCachedSecretKeyVerification,
} from "@/external/redis/actions/secretKeyCache/secretKeyCache.js";
import type { ApiKeyVerificationData } from "../../repos/getApiKeyVerificationData.js";
import { apiKeyRepo } from "../../repos/index.js";
import { ApiKeyPrefix, hashApiKey } from "../apiKeyUtils.js";

export const verifyKey = async ({
	db,
	key,
	requestId,
	skipL1 = false,
}: {
	db: DrizzleCli;
	key: string;
	requestId?: string;
	/** Read the verification payload (org + features) past this worker's L1. */
	skipL1?: boolean;
}): Promise<ApiKeyVerificationData | null> => {
	const hashedKey = hashApiKey(key);

	const env = key.startsWith(ApiKeyPrefix.Sandbox)
		? AppEnv.Sandbox
		: AppEnv.Live;

	const cached = await getCachedSecretKeyVerification({
		hashedKey,
		requestId,
		skipL1,
	});

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

	await setCachedSecretKeyVerification({ hashedKey, data, requestId });
	return data;
};
