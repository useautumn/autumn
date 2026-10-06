import {
	getCachedOrgWithFeatures,
	type ReadThroughCacheContext,
} from "@autumn/cache";
import { getOrgWithFeatures, type PostgresDb } from "@autumn/postgres";
import type { AppEnv, Feature, Organization } from "@autumn/shared";

type OrgWithFeatures = { org: Organization; features: Feature[] };

/** Matches the server's org L1 window: an org change reaches herald's pushes within the same bound. */
export const ORG_LOOKUP_REUSE_MS = 5_000;

const recentLookups = new Map<
	string,
	{ at: number; lookup: Promise<OrgWithFeatures | null> }
>();

const lookUpOrg = async ({
	ctx,
	orgId,
	env,
}: {
	ctx: ReadThroughCacheContext & { db: PostgresDb };
	orgId: string;
	env: AppEnv;
}): Promise<OrgWithFeatures | null> =>
	(await getCachedOrgWithFeatures<OrgWithFeatures>({ ctx, orgId, env })) ??
	(await getOrgWithFeatures({ ctx, orgId, env }));

/**
 * The server's cached org, else Postgres. Never written back: the server owns this key and its payload.
 * One lookup per org serves every caller for a few seconds, so a burst of pushes never queues on Redis or Postgres.
 */
export const getOrgWithFeaturesCached = ({
	ctx,
	orgId,
	env,
	now = Date.now,
	lookUp = lookUpOrg,
}: {
	ctx: ReadThroughCacheContext & { db: PostgresDb };
	orgId: string;
	env: AppEnv;
	now?: () => number;
	lookUp?: typeof lookUpOrg;
}): Promise<OrgWithFeatures | null> => {
	const key = `${orgId}:${env}`;
	const recent = recentLookups.get(key);
	if (recent && now() - recent.at < ORG_LOOKUP_REUSE_MS) return recent.lookup;
	const lookup = lookUp({ ctx, orgId, env });
	recentLookups.set(key, { at: now(), lookup });
	lookup.catch(() => {
		if (recentLookups.get(key)?.lookup === lookup) recentLookups.delete(key);
	});
	return lookup;
};

export const _resetOrgLookupsForTesting = () => recentLookups.clear();
