import { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	getCachedSecretKeyVerification,
	setCachedSecretKeyVerification,
} from "@/external/redis/actions/secretKeyCache/secretKeyCache.js";
import type { ApiKeyVerificationData } from "../../repos/getApiKeyVerificationData.js";
import { apiKeyRepo } from "../../repos/index.js";
import { ApiKeyPrefix, hashApiKey } from "../apiKeyUtils.js";

/** One lookup per key per process: a burst of cache misses (L1 expiry, slow Redis) waits on it
 *  instead of each caller taking a critical-pool connection for the same rows. */
const lookupsInFlight = new Map<
	string,
	Promise<ApiKeyVerificationData | null>
>();

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
	const data = skipL1
		? await lookUpVerification({ db, key, hashedKey, requestId, skipL1 })
		: await sharedLookUp({ db, key, hashedKey, requestId });
	if (!data) return null;

	// Backfill `pendingMigrations` on payloads cached before the field
	// existed — guarantees consumers can rely on the shape.
	const pendingMigrations = data.pendingMigrations ?? [];
	return {
		...data,
		pendingMigrations,
		org: { ...data.org, pendingMigrations },
	};
};

const sharedLookUp = ({
	db,
	key,
	hashedKey,
	requestId,
}: {
	db: DrizzleCli;
	key: string;
	hashedKey: string;
	requestId?: string;
}) => {
	const inFlight = lookupsInFlight.get(hashedKey);
	if (inFlight) return inFlight;

	const lookup = lookUpVerification({ db, key, hashedKey, requestId }).finally(
		() => lookupsInFlight.delete(hashedKey),
	);
	lookupsInFlight.set(hashedKey, lookup);
	return lookup;
};

const lookUpVerification = async ({
	db,
	key,
	hashedKey,
	requestId,
	skipL1 = false,
}: {
	db: DrizzleCli;
	key: string;
	hashedKey: string;
	requestId?: string;
	skipL1?: boolean;
}): Promise<ApiKeyVerificationData | null> => {
	const cached = await getCachedSecretKeyVerification({
		hashedKey,
		requestId,
		skipL1,
	});
	if (cached) return cached;

	const env = key.startsWith(ApiKeyPrefix.Sandbox)
		? AppEnv.Sandbox
		: AppEnv.Live;
	const data = await apiKeyRepo.getVerificationData({ db, hashedKey, env });
	if (!data) return null;

	await setCachedSecretKeyVerification({ hashedKey, data, requestId });
	return data;
};
