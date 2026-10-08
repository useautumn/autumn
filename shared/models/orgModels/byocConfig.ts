export const ByocCacheStatus = {
	AwaitingSetup: "awaiting_setup",
	Provisioning: "provisioning",
	Ready: "ready",
	Failed: "failed",
	/** A delete is tearing down what runs in the org's cloud. */
	Removing: "removing",
	/** What runs is gone; the org's stack stays until they delete it in their cloud. */
	TeardownRequired: "teardown_required",
} as const;

export type ByocCacheStatus =
	(typeof ByocCacheStatus)[keyof typeof ByocCacheStatus];

/** The steps a deploy goes through, in order; `connected` is Autumn reaching the running Atom. */
export const ByocCacheStage = {
	Stack: "stack",
	Disk: "disk",
	Machine: "machine",
	LoadBalancer: "load_balancer",
	Atom: "atom",
	Connected: "connected",
} as const;

export type ByocCacheStage =
	(typeof ByocCacheStage)[keyof typeof ByocCacheStage];

export const BYOC_CACHE_STAGES: readonly ByocCacheStage[] =
	Object.values(ByocCacheStage);

export const ByocCacheStageStatus = {
	Waiting: "waiting",
	Running: "running",
	Done: "done",
	Failed: "failed",
} as const;

export type ByocCacheStageStatus =
	(typeof ByocCacheStageStatus)[keyof typeof ByocCacheStageStatus];

export type ByocCacheStages = Record<ByocCacheStage, ByocCacheStageStatus>;

/** An existing VPC keeps Atom private to it; a new VPC serves it over the internet with its token. */
export type ByocCacheNetwork =
	| { type: "existing_vpc"; vpc_id: string; subnet_ids: string[] }
	| { type: "new_vpc" };

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
	/** The cloud region its setup asked for, then the one its deployment reports. Absent on records made before setup asked for one. */
	region?: string | null;
	network?: ByocCacheNetwork | null;
	/** How far the deploy got, as of the last refresh. */
	stages?: ByocCacheStages;
	/** Why the deploy or teardown stopped, in alien's words. */
	error?: string | null;
	/** When the dashboard handed the token over; it is only ever handed over once. */
	token_revealed_at?: number | null;
};

/** One env's infra in the org's own cloud; each env has its own column. */
export type ByocConfig = {
	cache?: ByocCacheDeployment;
};
