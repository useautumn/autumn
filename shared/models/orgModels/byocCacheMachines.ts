/** Atom's sizes: each pins one Graviton4 (c8g) EC2 type (`cpu` vCPUs, `memory` GiB). Its container gets one vCPU less and at most
 * 75% of the memory, never more than GKE's node reserve allows, so the OS and Alien's agent keep room. */
export const BYOC_CACHE_MACHINES = [
	{
		cpu: 2,
		memory: 4,
		instanceType: "c8g.large",
		container: { cpu: 1, memory: 2.75 },
		estimatedMonthlyUsd: 69,
	},
	{
		cpu: 4,
		memory: 8,
		instanceType: "c8g.xlarge",
		container: { cpu: 3, memory: 6 },
		estimatedMonthlyUsd: 138,
	},
	{
		cpu: 8,
		memory: 16,
		instanceType: "c8g.2xlarge",
		container: { cpu: 7, memory: 12 },
		estimatedMonthlyUsd: 276,
	},
] as const;

export type ByocCacheMachine = (typeof BYOC_CACHE_MACHINES)[number];

/** The container size every Atom ran before sizes existed, so a setup that names none is unchanged. */
export const DEFAULT_BYOC_CACHE_MACHINE: ByocCacheMachine =
	BYOC_CACHE_MACHINES[1];

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
