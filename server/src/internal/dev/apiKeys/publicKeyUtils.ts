import type { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
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
	const data = await OrgService.getFromPkeyWithFeatures({
		db,
		pkey,
		env,
	});

	if (!data) return null;

	const org = structuredClone(data);
	delete (org as any).features;

	return {
		org,
		features: data.features,
	};
};
