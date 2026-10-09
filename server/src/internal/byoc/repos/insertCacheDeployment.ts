import { atomDeployments, type ByocCacheDeployment } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** Claims the env's Atom; false when another request already holds it. */
export const insertCacheDeployment = async ({
	ctx,
	cacheDeployment,
}: {
	ctx: AutumnContext;
	cacheDeployment: ByocCacheDeployment;
}): Promise<boolean> => {
	const inserted = await ctx.db
		.insert(atomDeployments)
		.values(cacheDeployment)
		.onConflictDoNothing()
		.returning({ id: atomDeployments.id });
	return inserted.length > 0;
};
