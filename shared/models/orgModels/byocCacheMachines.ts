/** The machines a cache can run on: each `cpu` (vCPUs) and `memory` (GiB) pair is one Graviton EC2 type. */
export const BYOC_CACHE_MACHINES = [
	{ cpu: 2, memory: 1, instanceType: "t4g.micro", estimatedMonthlyUsd: 7 },
	{ cpu: 2, memory: 4, instanceType: "t4g.medium", estimatedMonthlyUsd: 27 },
	{ cpu: 4, memory: 8, instanceType: "c7g.xlarge", estimatedMonthlyUsd: 125 },
	{ cpu: 8, memory: 16, instanceType: "c7g.2xlarge", estimatedMonthlyUsd: 251 },
	{
		cpu: 16,
		memory: 32,
		instanceType: "c7g.4xlarge",
		estimatedMonthlyUsd: 501,
	},
] as const;

export type ByocCacheMachine = (typeof BYOC_CACHE_MACHINES)[number];

export const DEFAULT_BYOC_CACHE_MACHINE: ByocCacheMachine =
	BYOC_CACHE_MACHINES[0];

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
