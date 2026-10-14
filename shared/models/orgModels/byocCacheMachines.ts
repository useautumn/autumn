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

export const BYOC_CACHE_REPLICAS = 2;

export const BYOC_CACHE_DISK_GB = 20;

export const byocCacheMachineMonthlyUsd = (machine: ByocCacheMachine) =>
	Math.round(
		(machine.hourlyUsd * 730 + BYOC_CACHE_DISK_GB * 0.08) * BYOC_CACHE_REPLICAS,
	);

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
