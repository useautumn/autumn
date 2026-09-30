import type { MeteringIdentity } from "@autumn/balance-engine";
import { isByocCacheReady, orgToCacheDeployment } from "@autumn/byoc";
import { AppEnv } from "@autumn/shared";
import { z } from "zod/v4";
import { getOrgWithFeaturesCached } from "../../../orgs/getOrgWithFeaturesCached.js";
import type { CachePushContext } from "../types/cachePushContext.js";
import type { CacheReadyOrg } from "../types/cacheReadyOrg.js";

const appEnvSchema = z.enum(AppEnv);

/** The subject's org and its Atom's address, or null unless that env's cache is ready and reachable. */
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
	const { org } = orgWithFeatures;
	const cacheDeployment = orgToCacheDeployment({ org, env });
	if (!isByocCacheReady(cacheDeployment)) return null;
	if (!cacheDeployment.endpoint_url) return null;
	return {
		org,
		atomConnection: {
			endpointUrl: cacheDeployment.endpoint_url,
			encryptedToken: cacheDeployment.encrypted_token,
		},
	};
};
