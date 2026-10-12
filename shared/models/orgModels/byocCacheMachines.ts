/** Every Atom runs this many replicas, one per machine, for high availability. */
export const ATOM_REPLICAS = 2;

/** AWS list prices for us-east-1 (Pricing API GetProducts, Linux, shared tenancy, 2026-10-12): hourly × 730 h,
 *  plus each replica's 100 GB gp3 data volume at $0.08/GB-month, times the replicas. */
const HOURS_PER_MONTH = 730;
const DATA_VOLUME_USD_PER_MONTH = 100 * 0.08;
const estimatedMonthlyUsdOf = (hourlyUsd: number) =>
	Math.round(
		(hourlyUsd * HOURS_PER_MONTH + DATA_VOLUME_USD_PER_MONTH) * ATOM_REPLICAS,
	);

/** Atom's sizes: each pins one Graviton EC2 type (`cpu` vCPUs, `memory` GiB). Its container gets one vCPU less and at most
 * 75% of the memory, never more than GKE's node reserve allows, so the OS and Alien's agent keep room. */
export const BYOC_CACHE_MACHINES = [
	{
		cpu: 2,
		memory: 1,
		instanceType: "t4g.micro",
		container: { cpu: 1, memory: 0.625 },
		estimatedMonthlyUsd: estimatedMonthlyUsdOf(0.0084),
	},
	{
		cpu: 2,
		memory: 2,
		instanceType: "t4g.small",
		container: { cpu: 1, memory: 1.375 },
		estimatedMonthlyUsd: estimatedMonthlyUsdOf(0.0168),
	},
	{
		cpu: 2,
		memory: 4,
		instanceType: "c8g.large",
		container: { cpu: 1, memory: 2.75 },
		estimatedMonthlyUsd: estimatedMonthlyUsdOf(0.07976),
	},
	{
		cpu: 4,
		memory: 8,
		instanceType: "c8g.xlarge",
		container: { cpu: 3, memory: 6 },
		estimatedMonthlyUsd: estimatedMonthlyUsdOf(0.15952),
	},
	{
		cpu: 8,
		memory: 16,
		instanceType: "c8g.2xlarge",
		container: { cpu: 7, memory: 12 },
		estimatedMonthlyUsd: estimatedMonthlyUsdOf(0.31904),
	},
	{
		cpu: 16,
		memory: 32,
		instanceType: "c8g.4xlarge",
		container: { cpu: 15, memory: 24 },
		estimatedMonthlyUsd: estimatedMonthlyUsdOf(0.63808),
	},
] as const;

export type ByocCacheMachine = (typeof BYOC_CACHE_MACHINES)[number];

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
