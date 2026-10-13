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

/** Each replica's data volume, as `packages/alien/stacks/byoc/alien.json` sizes it; the Atom keeps its files within 80% of it. */
export const BYOC_CACHE_DISK_GB = 20;

/** AWS list price in us-east-1: (EC2 hourly × 730 h + the gp3 data disk × $0.08/GB-month) × replicas. */
export const byocCacheMachineMonthlyUsd = (machine: ByocCacheMachine) =>
	Math.round(
		(machine.hourlyUsd * 730 + BYOC_CACHE_DISK_GB * 0.08) * BYOC_CACHE_REPLICAS,
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
