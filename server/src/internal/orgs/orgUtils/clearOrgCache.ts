import type { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { CacheManager } from "@/utils/cacheUtils/CacheManager.js";
import { CacheType } from "@/utils/cacheUtils/CacheType.js";
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
	logger?: any;
}) => {
	// 1. Get all hashed secret key and public key for org
	try {
		const org = await OrgService.getWithKeys({
			db,
			orgId,
			env,
		});

		if (!org) {
			return;
		}

		const secretKeys = org.api_keys.map((key: any) => key.hashed_key);
		const publicKeys = [org.test_pkey, org.live_pkey];

		const batchDelete = [];
		for (const key of secretKeys) {
			batchDelete.push(
				CacheManager.invalidate({
					action: CacheType.SecretKey,
					value: key!,
				}),
			);
		}

		for (const key of publicKeys) {
			batchDelete.push(
				CacheManager.invalidate({
					action: CacheType.PublicKey,
					value: key!,
				}),
			);
		}

		await Promise.all(batchDelete);
		logger.info(`Cleared cache for org ${org.slug} (${orgId})`);
	} catch (error) {
		logger.error(`Failed to clear cache for org ${orgId}`);
		logger.error(error);
	}
};
