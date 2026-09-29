import {
	getCachedOrgWithFeatures,
	type ReadThroughCacheContext,
} from "@autumn/cache";
import { getOrgWithFeatures, type PostgresDb } from "@autumn/postgres";
import type { AppEnv, Feature, Organization } from "@autumn/shared";

type OrgWithFeatures = { org: Organization; features: Feature[] };

/** The server's cached org, else Postgres. Never written back: the server owns this key and its payload. */
export const getOrgWithFeaturesCached = async ({
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
