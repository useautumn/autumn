export const ByocCacheStatus = {
	AwaitingSetup: "awaiting_setup",
	Provisioning: "provisioning",
	Ready: "ready",
	Failed: "failed",
	Removing: "removing",
	TeardownRequired: "teardown_required",
} as const;

export type ByocCacheStatus =
	(typeof ByocCacheStatus)[keyof typeof ByocCacheStatus];

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

export const BYOC_CACHE_REMOVAL_STAGES: readonly ByocCacheStage[] = [
	ByocCacheStage.Atom,
	ByocCacheStage.Machine,
	ByocCacheStage.LoadBalancer,
	ByocCacheStage.Disk,
];

export const ByocCacheStageStatus = {
	Waiting: "waiting",
	Running: "running",
	Done: "done",
	Failed: "failed",
} as const;

export type ByocCacheStageStatus =
	(typeof ByocCacheStageStatus)[keyof typeof ByocCacheStageStatus];

export type ByocCacheStages = Record<ByocCacheStage, ByocCacheStageStatus>;

export type ByocCacheNetwork =
	| { type: "existing_vpc"; vpc_id: string; subnet_ids: string[] }
	| { type: "new_vpc" };
