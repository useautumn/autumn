import type { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import { clearSecretKeyCache } from "@/internal/dev/api-keys/cacheApiKeyUtils.js";
import { OrgService } from "../OrgService.js";

export const clearOrgCache = async ({
	db,
	orgId,
	env,
	logger = console,
}: {
	db: DrizzleCli;
	orgId: string;
	env?: AppEnv;
	logger?: Pick<Console, "error" | "info" | "warn">;
}) => {
	// 1. Get all hashed secret keys for org
	try {
		console.log(`[clearOrgCache DEBUG] Starting cache clear for org ${orgId}, env ${env}`);
		const org = await OrgService.getWithKeys({
			db,
			orgId,
			env,
		});

		if (!org) {
			console.log(`[clearOrgCache DEBUG] Org not found: ${orgId}`);
			return;
		}

		console.log(`[clearOrgCache DEBUG] Found org ${org.slug}, api_keys count: ${org.api_keys.length}`);

		const secretKeys = org.api_keys
			.map((key) => key.hashed_key)
			.filter((key): key is string => Boolean(key));

		console.log(`[clearOrgCache DEBUG] Hashed keys to clear: ${secretKeys.length}`);

		await Promise.all(
			secretKeys.map((hashedKey) =>
				clearSecretKeyCache({
					hashedKey,
					logger,
				}),
			),
		);
		console.log(`[clearOrgCache DEBUG] Successfully cleared ${secretKeys.length} keys`);
		logger.info(`Cleared cache for org ${org.slug} (${orgId})`);
	} catch (error) {
		console.log(`[clearOrgCache DEBUG] ERROR during cache clear:`, error);
		logger.error(`Failed to clear cache for org ${orgId}`);
		logger.error(error);
	}
};
