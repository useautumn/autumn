import {
	atomDeployments,
	type ByocCacheDeployment,
	ByocCacheStatus,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** Atoms in these statuses are on their way out and no longer hold the env. */
export const REMOVING_STATUSES = [
	ByocCacheStatus.Removing,
	ByocCacheStatus.TeardownRequired,
];

export const isEnvRow = ({ ctx }: { ctx: AutumnContext }) =>
	and(eq(atomDeployments.org_id, ctx.org.id), eq(atomDeployments.env, ctx.env));

/** The row as it was read: a delete or a move that landed since leaves nothing to match. */
export const isReadRow = ({
	ctx,
	cacheDeployment,
}: {
	ctx: AutumnContext;
	cacheDeployment: ByocCacheDeployment;
}) =>
	and(
		eq(atomDeployments.org_id, ctx.org.id),
		eq(atomDeployments.env, ctx.env),
		eq(atomDeployments.id, cacheDeployment.id),
		eq(
			atomDeployments.deployment_group_id,
			cacheDeployment.deployment_group_id,
		),
	);
