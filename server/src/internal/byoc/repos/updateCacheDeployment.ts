import { atomDeployments, type ByocCacheDeployment } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { changesAtomRoute } from "../utils/classifyCacheDeployment.js";
import { isReadRow } from "./utils/cacheDeploymentWhere.js";

/** Only what this write changes, so a field set by another writer since the read (`first_check_at`) survives. */
const changedColumns = ({
	from,
	to,
}: {
	from: ByocCacheDeployment;
	to: ByocCacheDeployment;
}): Partial<ByocCacheDeployment> =>
	Object.fromEntries(
		Object.entries(to).filter(
			([column, value]) =>
				JSON.stringify(value) !==
				JSON.stringify(from[column as keyof ByocCacheDeployment]),
		),
	);

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
	const changed = changedColumns({ from, to });
	if (Object.keys(changed).length === 0) return;
	await ctx.db
		.update(atomDeployments)
		.set(changed)
		.where(
			and(
				isReadRow({ ctx, cacheDeployment: from }),
				eq(atomDeployments.status, from.status),
			),
		);
	if (changesAtomRoute({ from, to }))
		await clearOrgCache({ db: ctx.db, orgId: ctx.org.id, env: ctx.env });
};
