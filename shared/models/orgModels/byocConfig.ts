export const ByocCacheStatus = {
	AwaitingSetup: "awaiting_setup",
	Provisioning: "provisioning",
	Ready: "ready",
	Failed: "failed",
} as const;

export type ByocCacheStatus =
	(typeof ByocCacheStatus)[keyof typeof ByocCacheStatus];

/** One env's cache deployment in the org's own cloud, as alien knows it. */
export type ByocCacheDeployment = {
	deployment_group_id: string;
	/** Null until the org runs the setup and alien creates the deployment. */
	deployment_id: string | null;
	status: ByocCacheStatus;
	/** Where the env's Atom answers; null until its deployment reports one. */
	endpoint_url: string | null;
	/** The machine's vCPUs and GiB: the one its setup asked for, then the one its deployment reports; null for a machine not in `BYOC_CACHE_MACHINES`. */
	cpu: number | null;
	memory: number | null;
	/** The Atom's token, encrypted at rest. The Atom itself holds only its hash. */
	encrypted_token: string;
	created_at: number;
};

/** One env's infra in the org's own cloud; each env has its own column. */
export type ByocConfig = {
	cache?: ByocCacheDeployment;
};
