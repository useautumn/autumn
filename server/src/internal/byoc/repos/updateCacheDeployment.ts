import { atomDeployments, type ByocCacheDeployment } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { publishCatalogInvalidation } from "@/internal/balanceWorker/catalog/publishCatalogInvalidation.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import {
	becomesAtomPushTarget,
	changesAtomRoute,
} from "../utils/classifyCacheDeployment.js";
import { pickChangedFields } from "../utils/pickChangedFields.js";
import { isReadRow } from "./utils/cacheDeploymentWhere.js";

/** Writes what changed from `from` to `to`, unless the status moved since the read; the cached org only drops when herald would route differently. */
export const updateCacheDeployment = async ({
	ctx,
	from,
	to,
}: {
	ctx: AutumnContext;
	from: ByocCacheDeployment;
	to: ByocCacheDeployment;
}): Promise<void> => {
	const changed = pickChangedFields({ from, to });
	if (Object.keys(changed).length === 0) return;
	const written = await ctx.db
		.update(atomDeployments)
		.set(changed)
		.where(
			and(
				isReadRow({ ctx, cacheDeployment: from }),
				eq(atomDeployments.status, from.status),
			),
		)
		.returning({ id: atomDeployments.id });
	if (changesAtomRoute({ from, to }))
		await clearOrgCache({ db: ctx.db, orgId: ctx.org.id, env: ctx.env });
	// Herald pushes a catalog only when it changes: the invalidation sends the new Atom its org's catalog now.
	if (
		written.length > 0 &&
		becomesAtomPushTarget({ from, to, orgId: ctx.org.id, env: ctx.env })
	)
		await publishCatalogInvalidation({ ctx, orgId: ctx.org.id, env: ctx.env });
};
