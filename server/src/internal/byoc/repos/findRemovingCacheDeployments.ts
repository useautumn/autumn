import { atomDeployments, type ByocCacheDeployment } from "@autumn/shared";
import { and, inArray } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isEnvRow, REMOVING_STATUSES } from "./utils/cacheDeploymentWhere.js";

/** Earlier Atoms still coming down, oldest first. */
export const findRemovingCacheDeployments = ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<ByocCacheDeployment[]> =>
	ctx.db.query.atomDeployments.findMany({
		where: and(
			isEnvRow({ ctx }),
			inArray(atomDeployments.status, REMOVING_STATUSES),
		),
		orderBy: atomDeployments.created_at,
	});
