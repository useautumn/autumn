import type { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import { clearOrgWithFeaturesCache } from "@/external/redis/actions/orgWithFeaturesCache/orgWithFeaturesCache.js";
import { clearSecretKeyCache } from "@/external/redis/actions/secretKeyCache/secretKeyCache.js";
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
		// Workers read org config through a short-TTL cache; drop it here so a
		// config change lands immediately rather than after the TTL.
		await clearOrgWithFeaturesCache({ orgId, env });

		logger.info(`Cleared cache for org ${org.slug} (${orgId})`);
	} catch (error) {
		logger.error(`Failed to clear cache for org ${orgId}`);
		logger.error(error);
	}
};
