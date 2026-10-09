import { atomDeployments, type ByocCacheDeployment } from "@autumn/shared";
import { and, notInArray } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isEnvRow, REMOVING_STATUSES } from "./utils/cacheDeploymentWhere.js";

/** The env's one active Atom as stored now; `ctx.org` is a cached copy, so it never says. */
export const findCacheDeployment = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<ByocCacheDeployment | null> =>
	(await ctx.db.query.atomDeployments.findFirst({
		where: and(
			isEnvRow({ ctx }),
			notInArray(atomDeployments.status, REMOVING_STATUSES),
		),
	})) ?? null;
