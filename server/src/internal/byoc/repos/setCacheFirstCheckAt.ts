import { atomDeployments, type ByocCacheDeployment } from "@autumn/shared";
import { and, isNull } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isReadRow } from "./utils/cacheDeploymentWhere.js";

/** Records the Atom's first check from the org's app, once. */
export const setCacheFirstCheckAt = async ({
	ctx,
	cacheDeployment,
	firstCheckAt,
}: {
	ctx: AutumnContext;
	cacheDeployment: ByocCacheDeployment;
	firstCheckAt: number;
}): Promise<void> => {
	await ctx.db
		.update(atomDeployments)
		.set({ first_check_at: firstCheckAt })
		.where(
			and(
				isReadRow({ ctx, cacheDeployment }),
				isNull(atomDeployments.first_check_at),
			),
		);
};
