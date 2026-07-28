import { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
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
}) => {
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
			valid: true,
			data: {
				...cached,
				pendingMigrations,
				org: { ...cached.org, pendingMigrations },
			},
		};
	}

	const data = await apiKeyRepo.getVerificationData({
		db,
		hashedKey,
		env,
	});

	if (!data) {
		return {
			valid: false,
			data: null,
		};
	}

	await setCachedSecretKeyVerification({ hashedKey, data });

	return {
		valid: true,
		data: data,
	};
};
