import { atomDeployments, type ByocCacheDeployment } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isEnvRow } from "./utils/cacheDeploymentWhere.js";

export const findCacheDeploymentById = async ({
	ctx,
	id,
}: {
	ctx: AutumnContext;
	id: string;
}): Promise<ByocCacheDeployment | null> =>
	(await ctx.db.query.atomDeployments.findFirst({
		where: and(isEnvRow({ ctx }), eq(atomDeployments.id, id)),
	})) ?? null;
