/** Atom's sizes: each pins one Graviton (t4g or c8g) EC2 type (`cpu` vCPUs, `memory` GiB). Its container gets one vCPU less and at most
 * 75% of the memory, never more than GKE's node reserve allows, so the OS and Alien's agent keep room. */
export const BYOC_CACHE_MACHINES = [
	{
		cpu: 2,
		memory: 1,
		instanceType: "t4g.micro",
		container: { cpu: 1, memory: 0.625 },
		hourlyUsd: 0.0084,
	},
	{
		cpu: 2,
		memory: 2,
		instanceType: "t4g.small",
		container: { cpu: 1, memory: 1.375 },
		hourlyUsd: 0.0168,
	},
	{
		cpu: 2,
		memory: 4,
		instanceType: "c8g.large",
		container: { cpu: 1, memory: 2.75 },
		hourlyUsd: 0.07976,
	},
	{
		cpu: 4,
		memory: 8,
		instanceType: "c8g.xlarge",
		container: { cpu: 3, memory: 6 },
		hourlyUsd: 0.15952,
	},
	{
		cpu: 8,
		memory: 16,
		instanceType: "c8g.2xlarge",
		container: { cpu: 7, memory: 12 },
		hourlyUsd: 0.31904,
	},
	{
		cpu: 16,
		memory: 32,
		instanceType: "c8g.4xlarge",
		container: { cpu: 15, memory: 24 },
		hourlyUsd: 0.63808,
	},
] as const;

export type ByocCacheMachine = (typeof BYOC_CACHE_MACHINES)[number];

/** Every Atom runs this many replicas, one per machine; `packages/alien/stacks/byoc/alien.json` declares the same. */
export const BYOC_CACHE_REPLICAS = 2;

/** Each replica's data volume unless its Atom picks another, as `packages/alien/stacks/byoc/alien.json` sizes it. */
export const DEFAULT_BYOC_CACHE_VOLUME_GIB = 20;

/** The sizes the dashboard offers; any whole GiB from the default up to alien's cap is accepted. */
export const BYOC_CACHE_VOLUME_PRESETS_GIB = [20, 50, 100] as const;
export const MIN_BYOC_CACHE_VOLUME_GIB = DEFAULT_BYOC_CACHE_VOLUME_GIB;
export const MAX_BYOC_CACHE_VOLUME_GIB = 65_536;

/** The Atom evicts cached customers once its volume is this full (`apps/atom/src/disk/createDiskEvictor.ts`). */
export const ATOM_DISK_EVICTION_SHARE = 0.8;

const GP3_USD_PER_GIB_MONTH = 0.08;
const HOURS_PER_MONTH = 730;

/** AWS list price in us-east-1 for both replicas' EC2 machines. */
export const byocCacheComputeMonthlyUsd = (machine: ByocCacheMachine) =>
	machine.hourlyUsd * HOURS_PER_MONTH * BYOC_CACHE_REPLICAS;

/** AWS list price in us-east-1 for both replicas' gp3 data volumes. */
export const byocCacheStorageMonthlyUsd = ({
	volumeSizeGib,
}: {
	volumeSizeGib: number;
}) => volumeSizeGib * GP3_USD_PER_GIB_MONTH * BYOC_CACHE_REPLICAS;

/** Both replicas' machines and volumes, rounded to whole dollars. */
export const byocCacheMonthlyUsd = ({
	machine,
	volumeSizeGib,
}: {
	machine: ByocCacheMachine;
	volumeSizeGib: number;
}) =>
	Math.round(
		byocCacheComputeMonthlyUsd(machine) +
			byocCacheStorageMonthlyUsd({ volumeSizeGib }),
	);

/** The container size every Atom ran before sizes existed, so a setup that names none is unchanged. */
export const DEFAULT_BYOC_CACHE_MACHINE: ByocCacheMachine =
	BYOC_CACHE_MACHINES[3];

export const findByocCacheMachine = ({
	cpu,
	memory,
}: {
	cpu: number;
	memory: number;
}): ByocCacheMachine | undefined =>
	BYOC_CACHE_MACHINES.find(
		(machine) => machine.cpu === cpu && machine.memory === memory,
	);

export const findByocCacheMachineByInstanceType = ({
	instanceType,
}: {
	instanceType: string;
}): ByocCacheMachine | undefined =>
	BYOC_CACHE_MACHINES.find((machine) => machine.instanceType === instanceType);
