import {
	type ApiByocCache,
	BYOC_CACHE_REPLICAS,
	type ByocCacheMachine,
	byocCacheMonthlyUsd,
	DEFAULT_BYOC_CACHE_VOLUME_GIB,
	findByocCacheMachine,
} from "@autumn/shared";

/** Names only the dashboard uses; the API speaks in `cpu` and `memory`. */
const MACHINE_LABELS: Record<ByocCacheMachine["instanceType"], string> = {
	"t4g.micro": "XXS",
	"t4g.small": "XS",
	"c8g.large": "Small",
	"c8g.xlarge": "Medium",
	"c8g.2xlarge": "Large",
	"c8g.4xlarge": "XL",
};

/** The size selected when setup starts. */
export const DEFAULT_ATOM_INSTANCE_TYPE: ByocCacheMachine["instanceType"] =
	"c8g.xlarge";

export const atomMachineLabel = (machine: ByocCacheMachine) =>
	MACHINE_LABELS[machine.instanceType];

/** The machine the size runs on, as AWS sells it. */
export const atomMachineSpecs = (machine: ByocCacheMachine) =>
	`${machine.cpu} vCPU · ${machine.memory} GiB`;

/** Every replica's machine, e.g. `2 × t4g.micro`. */
export const atomMachinesLabel = (machine: ByocCacheMachine) =>
	`${BYOC_CACHE_REPLICAS} × ${machine.instanceType}`;

export const atomMonthlyEstimate = (machine: ByocCacheMachine) =>
	`~$${byocCacheMonthlyUsd({ machine, volumeSizeGib: DEFAULT_BYOC_CACHE_VOLUME_GIB })}`;

/** The Atom container's limits on that machine, which its utilization is measured against. */
export const atomContainerSpecs = ({ container }: ByocCacheMachine) =>
	`${container.cpu} vCPU · ${container.memory} GiB`;

export const ATOM_RESIZE_NOTE =
	"Resizing takes up to a minute. During this time the SDK falls back to the Autumn API.";

/** Null while Atom runs on a machine Autumn does not offer. */
export const cacheToMachine = (
	cache: ApiByocCache,
): ByocCacheMachine | null => {
	if (cache.cpu === null || cache.memory === null) return null;
	return findByocCacheMachine({ cpu: cache.cpu, memory: cache.memory }) ?? null;
};
