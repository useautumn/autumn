import { atomDeployments, type ByocCacheDeployment } from "@autumn/shared";
import { and, notInArray } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { atomIdRequired } from "../utils/byocCacheUtils.js";
import { findCacheDeploymentById } from "./findCacheDeploymentById.js";
import { isEnvRow, REMOVING_STATUSES } from "./utils/cacheDeploymentWhere.js";

/** The env's Atom by id, whatever its status; with no id, its only active one. `ctx.org` is a cached copy, so it never says. */
export const findCacheDeployment = async ({
	ctx,
	atomId,
}: {
	ctx: AutumnContext;
	atomId?: string;
}): Promise<ByocCacheDeployment | null> => {
	if (atomId) return findCacheDeploymentById({ ctx, id: atomId });
	const active = await ctx.db.query.atomDeployments.findMany({
		where: and(
			isEnvRow({ ctx }),
			notInArray(atomDeployments.status, REMOVING_STATUSES),
		),
		limit: 2,
	});
	if (active.length > 1) throw atomIdRequired();
	return active[0] ?? null;
};
