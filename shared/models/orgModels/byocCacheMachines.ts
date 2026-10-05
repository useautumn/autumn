const NEEDS_PER_TIER_SIZING = "Needs per-tier sizing (coming)";

/** The Graviton (c7g) machines a cache can run on, one per tier; `memory` is GiB.
 * `estimatedMonthlyUsd` is AWS us-east-1 on-demand plus Alien's ~$9/mo fee. */
export const BYOC_CACHE_MACHINES = [
	{
		tier: "Lite",
		cpu: 1,
		memory: 2,
		instanceType: "c7g.medium",
		available: false,
		unavailableReason: NEEDS_PER_TIER_SIZING,
		estimatedMonthlyUsd: 35,
	},
	{
		tier: "Small",
		cpu: 2,
		memory: 4,
		instanceType: "c7g.large",
		available: false,
		unavailableReason: NEEDS_PER_TIER_SIZING,
		estimatedMonthlyUsd: 62,
	},
	{
		tier: "Medium",
		cpu: 4,
		memory: 8,
		instanceType: "c7g.xlarge",
		available: false,
		unavailableReason: NEEDS_PER_TIER_SIZING,
		estimatedMonthlyUsd: 115,
	},
	{
		tier: "Large",
		cpu: 8,
		memory: 16,
		instanceType: "c7g.2xlarge",
		// The stack's container request (alien.json) only fits Large until per-tier sizing lands.
		available: true,
		unavailableReason: null,
		estimatedMonthlyUsd: 220,
	},
] as const;

export type ByocCacheMachine = (typeof BYOC_CACHE_MACHINES)[number];

/** Large while it is the only tier that fits the stack; Small once per-tier sizing lands. */
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
