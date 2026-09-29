import type { AppEnv, Feature, Organization } from "@autumn/shared";

/** An org whose env has a ready cache: what rendering needs, and the deployment its KV lives in. */
export type CacheReadyOrg = {
	org: Organization;
	env: AppEnv;
	features: Feature[];
	deploymentId: string;
};
