import { DrizzleCli } from "@/db/initDrizzle.js";
import { CacheType } from "@/external/caching/cacheActions.js";
import { queryWithCache } from "@/external/caching/cacheUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { AppEnv } from "@autumn/shared";

export const verifyPublicKey = async ({
	db,
	pkey,
	env,
}: {
	db: DrizzleCli;
	pkey: string;
	env: AppEnv;
}) => {
	let data = await queryWithCache({
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

	let org = structuredClone(data);

	delete org.features;
	return {
		org,
		features: data.features,
	};
};
