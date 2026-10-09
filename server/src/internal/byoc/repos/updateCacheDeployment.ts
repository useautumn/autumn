import { atomDeployments, type ByocCacheDeployment } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { changesAtomRoute } from "../utils/classifyCacheDeployment.js";
import { isReadRow } from "./utils/cacheDeploymentWhere.js";

/** Writes `to` over the row as `from` read it; the cached org only drops when herald would route differently. */
export const updateCacheDeployment = async ({
	ctx,
	from,
	to,
}: {
	ctx: AutumnContext;
	from: ByocCacheDeployment;
	to: ByocCacheDeployment;
}): Promise<void> => {
	await ctx.db
		.update(atomDeployments)
		.set(to)
		.where(isReadRow({ ctx, cacheDeployment: from }));
	if (changesAtomRoute({ from, to }))
		await clearOrgCache({ db: ctx.db, orgId: ctx.org.id, env: ctx.env });
};
