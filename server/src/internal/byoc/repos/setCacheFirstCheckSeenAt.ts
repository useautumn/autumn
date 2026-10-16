import { atomDeployments, type ByocCacheDeployment } from "@autumn/shared";
import { and, isNull } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isReadRow } from "./utils/cacheDeploymentWhere.js";

/** Records when the Atom first counted a check from the org's app, once. */
export const setCacheFirstCheckSeenAt = async ({
	ctx,
	cacheDeployment,
	firstCheckSeenAt,
}: {
	ctx: AutumnContext;
	cacheDeployment: ByocCacheDeployment;
	firstCheckSeenAt: number;
}): Promise<void> => {
	await ctx.db
		.update(atomDeployments)
		.set({ first_check_seen_at: firstCheckSeenAt })
		.where(
			and(
				isReadRow({ ctx, cacheDeployment }),
				isNull(atomDeployments.first_check_seen_at),
			),
		);
};
