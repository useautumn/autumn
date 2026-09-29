import {
	AppEnv,
	type ByocCacheDeployment,
	organizations,
} from "@autumn/shared";
import { and, eq, type SQL, sql } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";

const envByocConfigKey = ({ ctx }: { ctx: AutumnContext }) =>
	ctx.env === AppEnv.Live ? "live_byoc_config" : "sandbox_byoc_config";

const envByocConfig = ({ ctx }: { ctx: AutumnContext }) =>
	organizations[envByocConfigKey({ ctx })];

const envCache = ({ ctx }: { ctx: AutumnContext }) =>
	sql`${envByocConfig({ ctx })}->'cache'`;

const withCache = ({
	ctx,
	cacheDeployment,
}: {
	ctx: AutumnContext;
	cacheDeployment: ByocCacheDeployment;
}) =>
	sql`COALESCE(${envByocConfig({ ctx })}, '{}'::jsonb) || jsonb_build_object('cache', ${JSON.stringify(cacheDeployment)}::jsonb)`;

const writeByocConfig = async ({
	ctx,
	value,
	condition,
}: {
	ctx: AutumnContext;
	value: SQL;
	condition: SQL;
}): Promise<boolean> => {
	const written = await ctx.db
		.update(organizations)
		.set({ [envByocConfigKey({ ctx })]: value })
		.where(and(eq(organizations.id, ctx.org.id), condition))
		.returning({ id: organizations.id });
	await clearOrgCache({ db: ctx.db, orgId: ctx.org.id });
	return written.length > 0;
};

/** Claims the env's cache; false when another request already holds it. */
export const insertCacheDeployment = ({
	ctx,
	cacheDeployment,
}: {
	ctx: AutumnContext;
	cacheDeployment: ByocCacheDeployment;
}) =>
	writeByocConfig({
		ctx,
		value: withCache({ ctx, cacheDeployment }),
		condition: sql`${envCache({ ctx })} IS NULL`,
	});

/** Only lands on the same deployment group, so a refresh racing a delete cannot bring it back. */
export const updateCacheDeployment = ({
	ctx,
	cacheDeployment,
}: {
	ctx: AutumnContext;
	cacheDeployment: ByocCacheDeployment;
}) =>
	writeByocConfig({
		ctx,
		value: withCache({ ctx, cacheDeployment }),
		condition: sql`${envCache({ ctx })}->>'deployment_group_id' = ${cacheDeployment.deployment_group_id}`,
	});

/** Only forgets the cache this delete began with: a replacement reuses its group, so `created_at` tells them apart. */
export const deleteCacheDeployment = ({
	ctx,
	cacheDeployment,
}: {
	ctx: AutumnContext;
	cacheDeployment: ByocCacheDeployment;
}) =>
	writeByocConfig({
		ctx,
		value: sql`${envByocConfig({ ctx })} - 'cache'`,
		condition: sql`(${envCache({ ctx })}->>'created_at')::bigint = ${cacheDeployment.created_at}`,
	});
