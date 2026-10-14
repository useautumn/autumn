import {
	atomDeployments,
	type ByocCacheDeployment,
	ByocCacheStatus,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const REMOVING_STATUSES = [
	ByocCacheStatus.Removing,
	ByocCacheStatus.TeardownRequired,
];

export const isEnvRow = ({ ctx }: { ctx: AutumnContext }) =>
	and(eq(atomDeployments.org_id, ctx.org.id), eq(atomDeployments.env, ctx.env));

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
