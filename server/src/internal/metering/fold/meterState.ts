export type FeatureMeter = {
	granted: number;
	balance: number;
};

export type DedupeWindow = {
	capacity: number;
	ids: string[];
};

// Customers are keyed by customer_id alone: a partition is owned by one worker,
// and org/env scoping of the key is deferred until the log carries more tenants.
export type MeterState = {
	customers: Record<string, Record<string, FeatureMeter>>;
	dedupe: DedupeWindow;
};

export const DEFAULT_DEDUPE_CAPACITY = 10_000;

export const createMeterState = ({
	dedupeCapacity = DEFAULT_DEDUPE_CAPACITY,
}: {
	dedupeCapacity?: number;
} = {}): MeterState => ({
	customers: {},
	dedupe: { capacity: Math.max(1, dedupeCapacity), ids: [] },
});

export const readFeatureMeter = ({
	state,
	customerId,
	featureId,
}: {
	state: MeterState;
	customerId: string;
	featureId: string;
}): FeatureMeter | undefined => state.customers[customerId]?.[featureId];

export const deserializeMeterState = ({
	serialized,
}: {
	serialized: string;
}): MeterState => {
	const parsed = JSON.parse(serialized) as Partial<MeterState>;
	return {
		customers: parsed.customers ?? {},
		dedupe: {
			capacity: parsed.dedupe?.capacity ?? DEFAULT_DEDUPE_CAPACITY,
			ids: parsed.dedupe?.ids ?? [],
		},
	};
};
