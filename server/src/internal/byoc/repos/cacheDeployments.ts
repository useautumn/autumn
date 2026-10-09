import {
	type AppEnv,
	atomDeployments,
	type ByocCacheDeployment,
	ByocCacheStatus,
} from "@autumn/shared";
import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { changesAtomRoute } from "../utils/classifyCacheDeployment.js";

/** The row as it was read: a delete or a move that landed since leaves nothing to match. */
const isReadRow = ({
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

/** Atoms in these statuses are on their way out and no longer hold the env. */
const REMOVING_STATUSES = [
	ByocCacheStatus.Removing,
	ByocCacheStatus.TeardownRequired,
];

const isEnvRow = ({ ctx }: { ctx: AutumnContext }) =>
	and(eq(atomDeployments.org_id, ctx.org.id), eq(atomDeployments.env, ctx.env));

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

/** One of the env's Atoms by id, whatever its status. */
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

/** Claims the env's Atom; false when another request already holds it. */
export const insertCacheDeployment = async ({
	ctx,
	cacheDeployment,
}: {
	ctx: AutumnContext;
	cacheDeployment: ByocCacheDeployment;
}): Promise<boolean> => {
	const inserted = await ctx.db
		.insert(atomDeployments)
		.values(cacheDeployment)
		.onConflictDoNothing()
		.returning({ id: atomDeployments.id });
	return inserted.length > 0;
};

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

/** Records the Atom's first check from the org's app, once. */
export const setCacheFirstCheckAt = async ({
	ctx,
	cacheDeployment,
	firstCheckAt,
}: {
	ctx: AutumnContext;
	cacheDeployment: ByocCacheDeployment;
	firstCheckAt: number;
}): Promise<void> => {
	await ctx.db
		.update(atomDeployments)
		.set({ first_check_at: firstCheckAt })
		.where(
			and(
				isReadRow({ ctx, cacheDeployment }),
				isNull(atomDeployments.first_check_at),
			),
		);
};

/** Forgets an Atom whose removal finished; a replacement is a new row, so it is never the one forgotten. */
export const deleteCacheDeployment = async ({
	ctx,
	cacheDeployment,
}: {
	ctx: AutumnContext;
	cacheDeployment: ByocCacheDeployment;
}): Promise<void> => {
	await ctx.db
		.delete(atomDeployments)
		.where(isReadRow({ ctx, cacheDeployment }));
};

/** The org and env whose Atom holds this token hash; null when no Atom does. */
export const findCacheByTokenHash = async ({
	db,
	tokenHash,
}: {
	db: DrizzleCli;
	tokenHash: string;
}): Promise<{ orgId: string; env: AppEnv } | null> => {
	const [found] = await db
		.select({ orgId: atomDeployments.org_id, env: atomDeployments.env })
		.from(atomDeployments)
		.where(eq(atomDeployments.token_hash, tokenHash))
		.limit(1);
	return found ?? null;
};
