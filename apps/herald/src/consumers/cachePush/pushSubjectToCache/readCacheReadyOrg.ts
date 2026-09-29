import type { MeteringIdentity } from "@autumn/balance-engine";
import { isByocCacheReady, orgToCacheDeployment } from "@autumn/byoc";
import { AppEnv } from "@autumn/shared";
import { z } from "zod/v4";
import { getOrgWithFeaturesCached } from "../../../orgs/getOrgWithFeaturesCached.js";
import type { CachePushContext } from "../types/cachePushContext.js";
import type { CacheReadyOrg } from "../types/cacheReadyOrg.js";

const appEnvSchema = z.enum(AppEnv);

/** The subject's org with its features, or null unless that env's cache is ready to take entries. */
export const readCacheReadyOrg = async ({
	ctx,
	identity,
}: {
	ctx: CachePushContext;
	identity: MeteringIdentity;
}): Promise<CacheReadyOrg | null> => {
	const env = appEnvSchema.parse(identity.env);
	const orgWithFeatures = await getOrgWithFeaturesCached({
		ctx,
		orgId: identity.orgId,
		env,
	});
	if (!orgWithFeatures) return null;
	const { org, features } = orgWithFeatures;
	const cacheDeployment = orgToCacheDeployment({ org, env });
	if (!isByocCacheReady(cacheDeployment)) return null;
	return { org, env, features, deploymentId: cacheDeployment.deployment_id };
};
