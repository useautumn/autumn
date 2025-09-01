import type { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { CacheType } from "@/external/caching/cacheActions.js";
import { queryWithCache } from "@/external/caching/cacheUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

export const verifyPublicKey = async ({
	db,
	pkey,
	env,
}: {
	db: DrizzleCli;
	pkey: string;
	env: AppEnv;
}) => {
	const data = await queryWithCache({
		action: CacheType.PublicKey,
		key: pkey,
		fn: async () =>
			await OrgService.getFromPkeyWithFeatures({
				db,
				pkey,
				env,
			}),
	});

	if (!data) {
		return null;
	}

	const org = structuredClone(data);

	delete org.features;
	return {
		org,
		features: data.features,
	};
};
