import type { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { toPlanAliasMap } from "@/internal/catalogV2/productAliases/toPlanAliasMap.js";

export const verifyPublicKey = async ({
	db,
	pkey,
	env,
}: {
	db: DrizzleCli;
	pkey: string;
	env: AppEnv;
}) => {
	const data = await OrgService.getFromPkeyWithFeatures({
		db,
		pkey,
		env,
	});

	if (!data) return null;

	const org = structuredClone(data);
	delete (org as any).features;
	delete (org as any).product_aliases;

	return {
		org: {
			...org,
			planAliases: toPlanAliasMap({ rows: data.product_aliases }),
		},
		features: data.features,
	};
};
