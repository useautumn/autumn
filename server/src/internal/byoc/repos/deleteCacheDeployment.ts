import { atomDeployments, type ByocCacheDeployment } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isReadRow } from "./utils/cacheDeploymentWhere.js";

export const deleteCacheDeployment = async ({
	ctx,
	cacheDeployment,
}: {
	ctx: AutumnContext;
	cacheDeployment: ByocCacheDeployment;
}): Promise<void> => {
	await ctx.db
		.delete(atomDeployments)
		.where(isReadRow({ ctx, cacheDeployment }));
};
