import type {
	BYOC_CACHE_VOLUME_PRESETS_GIB,
	ByocCacheMachine,
} from "@autumn/shared";

type AtomMachineCapacity = {
	/** Checks per second across both replicas, measured on our benchmarks. */
	checksPerSecond: number;
	/** Active customers each replica holds. */
	activeCustomers: number;
	/** Extrapolated past what the benchmarks reached, not measured. */
	isCustomerEstimate: boolean;
	/** The smallest preset keeping these customers at 256 KiB each, plus 2 GiB overhead, under 60% of the volume. */
	recommendedVolumeGib: (typeof BYOC_CACHE_VOLUME_PRESETS_GIB)[number];
};

/** What each size handles and the storage it needs; the create flow's capacity columns and Recommended chip read only this. */
export const ATOM_MACHINE_CAPACITY: Record<
	ByocCacheMachine["instanceType"],
	AtomMachineCapacity
> = {
	"t4g.micro": {
		checksPerSecond: 130,
		activeCustomers: 250,
		isCustomerEstimate: false,
		recommendedVolumeGib: 20,
	},
	"t4g.small": {
		checksPerSecond: 200,
		activeCustomers: 1_500,
		isCustomerEstimate: false,
		recommendedVolumeGib: 20,
	},
	"c8g.large": {
		checksPerSecond: 800,
		activeCustomers: 6_000,
		isCustomerEstimate: false,
		recommendedVolumeGib: 20,
	},
	"c8g.xlarge": {
		checksPerSecond: 8_000,
		activeCustomers: 26_000,
		isCustomerEstimate: false,
		recommendedVolumeGib: 20,
	},
	"c8g.2xlarge": {
		checksPerSecond: 14_000,
		activeCustomers: 53_000,
		isCustomerEstimate: true,
		recommendedVolumeGib: 50,
	},
	"c8g.4xlarge": {
		checksPerSecond: 16_000,
		activeCustomers: 113_000,
		isCustomerEstimate: true,
		recommendedVolumeGib: 50,
	},
};

export const ATOM_CAPACITY_FOOTNOTE =
	"Measured on our benchmarks; † estimated. Capacity varies with workload.";

export const ATOM_STORAGE_RECOMMENDATION_NOTE =
	"Estimate, not a quota. Based on a measured 21.6–21.7 KB per subject, allowing for 10 subject/entity rows per customer and rounding up to 256 KiB/customer. Adds a fixed 2 GiB for journals, WAL, catalog and filesystem overhead. Presets target ≤60% use, below the 80% eviction threshold. More entities, larger balances or heavier writes may need more storage.";

/** 8000 → `8k`, 1500 → `1.5k`, 250 → `250`. */
const compactCount = (count: number) =>
	count < 1_000 ? String(count) : `${Number((count / 1_000).toFixed(1))}k`;

/** e.g. `~8k`. */
export const atomChecksPerSecondLabel = (machine: ByocCacheMachine) =>
	`~${compactCount(ATOM_MACHINE_CAPACITY[machine.instanceType].checksPerSecond)}`;

/** e.g. `26k`, or `53k†` when extrapolated. */
export const atomActiveCustomersLabel = (machine: ByocCacheMachine) => {
	const { activeCustomers, isCustomerEstimate } =
		ATOM_MACHINE_CAPACITY[machine.instanceType];
	return `${compactCount(activeCustomers)}${isCustomerEstimate ? "†" : ""}`;
};

export const atomRecommendedVolumeGib = (machine: ByocCacheMachine) =>
	ATOM_MACHINE_CAPACITY[machine.instanceType].recommendedVolumeGib;
