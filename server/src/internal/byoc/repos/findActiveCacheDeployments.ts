import { atomDeployments, type ByocCacheDeployment } from "@autumn/shared";
import { and, notInArray } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isEnvRow, REMOVING_STATUSES } from "./utils/cacheDeploymentWhere.js";

/** The env's Atoms that are not on their way out, oldest first. */
export const findActiveCacheDeployments = ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<ByocCacheDeployment[]> =>
	ctx.db.query.atomDeployments.findMany({
		where: and(
			isEnvRow({ ctx }),
			notInArray(atomDeployments.status, REMOVING_STATUSES),
		),
		orderBy: atomDeployments.created_at,
	});
