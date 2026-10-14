import { db } from "@/db/initDrizzle.js";
import { getMiscRedis, waitForRedisReady } from "@/external/redis/initRedis.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";

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
	await waitForRedisReady(getMiscRedis(), "main");
	await clearOrgCache({ db, orgId });
};
