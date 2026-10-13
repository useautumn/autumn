import { atomDeployments, type ByocCacheDeployment } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isReadRow } from "./utils/cacheDeploymentWhere.js";

/** Forgets an Atom whose removal finished; a replacement is a new row, so it is never the one forgotten. */
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
