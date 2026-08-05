import type { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import {
	getCachedOrgWithFeatures,
	setCachedOrgWithFeatures,
} from "@/external/redis/actions/orgWithFeaturesCache/orgWithFeaturesCache.js";
import { OrgService } from "../OrgService.js";

type OrgWithFeatures = NonNullable<
	Awaited<ReturnType<typeof OrgService.getWithFeatures>>
>;

/**
 * Read-through cache around `OrgService.getWithFeatures`.
 *
 * Queue workers call this once per message and async `balances.track` enqueues
 * one message per API request, so the uncached path was running ~1,140 times a
 * second against Postgres — 3.08M lookups in 45 minutes, 8.4% of database time —
 * for a row that barely changes.
 *
 * Redis is strictly an accelerator: every op goes through `tryRedisOp`, which
 * swallows failures, so an outage reads as a cache miss and falls through to
 * Postgres. That must hold — if a Redis error escaped here,
 * `createWorkerContext` would catch it, treat the org as missing, and silently
 * acknowledge queued jobs without recording usage.
 */
export const getOrgWithFeaturesCached = async ({
	db,
	orgId,
	env,
	skipCache = false,
	requestId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	skipCache?: boolean;
	requestId?: string;
}): Promise<OrgWithFeatures | null> => {
	if (!skipCache) {
		const cached = await getCachedOrgWithFeatures<OrgWithFeatures>({
			orgId,
			env,
			requestId,
		});
		if (cached) return cached;
	}

	const fresh = await OrgService.getWithFeatures({ db, orgId, env });
	if (!fresh) return null;

	await setCachedOrgWithFeatures({ orgId, env, data: fresh, requestId });
	return fresh;
};
