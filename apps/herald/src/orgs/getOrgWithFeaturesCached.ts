import {
	type ReadThroughCacheContext,
	readThroughOrgWithFeatures,
} from "@autumn/cache";
import { getOrgWithFeatures, type PostgresDb } from "@autumn/postgres";
import type { AppEnv } from "@autumn/shared";

type OrgWithFeatures = NonNullable<
	Awaited<ReturnType<typeof getOrgWithFeatures>>
>;

/** The server's cached org, else Postgres; a burst of pushes for one org shares one lookup. */
export const getOrgWithFeaturesCached = ({
	ctx,
	orgId,
	env,
}: {
	ctx: ReadThroughCacheContext & { db: PostgresDb };
	orgId: string;
	env: AppEnv;
}): Promise<OrgWithFeatures | null> =>
	readThroughOrgWithFeatures({
		ctx,
		orgId,
		env,
		load: () => getOrgWithFeatures({ ctx, orgId, env }),
	});
