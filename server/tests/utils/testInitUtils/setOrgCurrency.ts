import { db } from "@/db/initDrizzle.js";
import { getMiscRedis, waitForRedisReady } from "@/external/redis/initRedis.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";

/**
 * Sets an org's default_currency and clears its cached secret-key verification.
 * Use a dedicated sub-org: currency is org-wide state and test files run in parallel.
 */
export const setOrgCurrency = async ({
	orgId,
	currency,
}: {
	orgId: string;
	currency: string;
}) => {
	await OrgService.update({
		db,
		orgId,
		updates: { default_currency: currency },
	});
	// clearOrgCache silently skips Redis deletes until the client is ready
	await waitForRedisReady(getMiscRedis(), "main");
	await clearOrgCache({ db, orgId });
};
