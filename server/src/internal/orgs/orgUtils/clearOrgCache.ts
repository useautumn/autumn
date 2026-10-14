import { clearOrgWithFeaturesCache } from "@autumn/cache";
import type { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import { clearSecretKeyCache } from "@/external/redis/actions/secretKeyCache/secretKeyCache.js";
import { getMiscCacheContext } from "@/external/redis/miscCache/getMiscCacheContext.js";
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
	try {
		const org = await OrgService.getWithKeys({
			db,
			orgId,
			env,
		});

		if (!org) {
			return;
		}

		const secretKeys = org.api_keys
			.map((key) => key.hashed_key)
			.filter((key): key is string => Boolean(key));

		await Promise.all(
			secretKeys.map((hashedKey) => clearSecretKeyCache({ hashedKey })),
		);
		await clearOrgWithFeaturesCache({ ctx: getMiscCacheContext(), orgId, env });

		logger.info(`Cleared cache for org ${org.slug} (${orgId})`);
	} catch (error) {
		logger.error(`Failed to clear cache for org ${orgId}`);
		logger.error(error);
	}
};
