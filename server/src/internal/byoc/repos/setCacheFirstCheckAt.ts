import { atomDeployments, type ByocCacheDeployment } from "@autumn/shared";
import { and, isNull } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isReadRow } from "./utils/cacheDeploymentWhere.js";

/** Records that the org finished setup, once; `first_check_seen_at` is when Atom first saw a check, kept apart. */
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
