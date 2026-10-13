import { atomDeployments, type ByocCacheDeployment } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isEnvRow } from "./utils/cacheDeploymentWhere.js";

/** The Atom following this deployment group, whatever its status. */
export const findCacheDeploymentByGroupId = async ({
	ctx,
	deploymentGroupId,
}: {
	ctx: AutumnContext;
	deploymentGroupId: string;
}): Promise<ByocCacheDeployment | null> =>
	(await ctx.db.query.atomDeployments.findFirst({
		where: and(
			isEnvRow({ ctx }),
			eq(atomDeployments.deployment_group_id, deploymentGroupId),
		),
	})) ?? null;
