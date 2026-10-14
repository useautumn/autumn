import type { ByocCacheDeployment } from "@autumn/shared";

export type AtomRecord = Pick<
	ByocCacheDeployment,
	| "deployment_group_id"
	| "deployment_id"
	| "status"
	| "endpoint_url"
	| "cpu"
	| "memory"
	| "region"
	| "stages"
	| "error"
>;
