import type {
	AppEnv,
	ByocCacheDeployment,
	ByocConfig,
	Organization,
} from "@autumn/shared";

/** Each env keeps its BYOC config in a column of its own. */
export const orgToByocConfig = ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}): ByocConfig | null => org[`${env}_byoc_config`];

export const orgToCacheDeployment = ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}): ByocCacheDeployment | null => orgToByocConfig({ org, env })?.cache ?? null;
