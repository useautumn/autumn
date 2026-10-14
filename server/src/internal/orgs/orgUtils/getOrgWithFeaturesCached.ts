import {
	readThroughOrgWithFeatures,
	setCachedOrgWithFeatures,
} from "@autumn/cache";
import type { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import { getMiscCacheContext } from "@/external/redis/miscCache/getMiscCacheContext.js";
import { OrgService } from "../OrgService.js";

type OrgWithFeatures = NonNullable<
	Awaited<ReturnType<typeof OrgService.getWithFeatures>>
>;

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
	const load = () => OrgService.getWithFeatures({ db, orgId, env });
	if (!skipCache)
		return readThroughOrgWithFeatures({
			ctx: getMiscCacheContext(),
			orgId,
			env,
			load,
			requestId,
		});

	const fresh = await load();
	if (!fresh) return null;

	await setCachedOrgWithFeatures({
		ctx: getMiscCacheContext(),
		orgId,
		env,
		data: fresh,
		requestId,
	});
	return fresh;
};
