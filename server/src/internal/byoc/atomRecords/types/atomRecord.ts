import type { ByocCacheDeployment } from "@autumn/shared";

/** What the shared lifecycle reads and writes of an Atom's record, wherever it is kept. */
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
