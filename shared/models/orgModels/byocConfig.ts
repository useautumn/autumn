import type { ByocCacheDeployment } from "./atomDeploymentTable.js";

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

/** An existing VPC keeps Atom private to it; a new VPC serves it over the internet to the org's secret keys. */
export type ByocCacheNetwork =
	| { type: "existing_vpc"; vpc_id: string; subnet_ids: string[] }
	| { type: "new_vpc" };

/** One env's infra in the org's own cloud; each env has its own column. */
export type ByocConfig = {
	cache?: ByocCacheDeployment;
};
