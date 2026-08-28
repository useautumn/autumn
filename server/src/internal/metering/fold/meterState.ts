export type FeatureMeter = {
	granted: number;
	balance: number;
};

export type DedupeWindow = {
	capacity: number;
	ids: string[];
};

export const METER_STATE_VERSION = 2 as const;

// A subject key includes every part of the balance identity. JSON encoding avoids
// delimiter collisions when ids themselves contain punctuation.
export const meterSubjectKeyOf = ({
	orgId,
	env,
	customerId,
}: {
	orgId: string;
	env: string;
	customerId: string;
}): string => JSON.stringify([orgId, env, customerId]);

export type MeterState = {
	version: typeof METER_STATE_VERSION;
	customers: Record<string, Record<string, FeatureMeter>>;
	dedupe: DedupeWindow;
};

export class UnsupportedMeterStateVersionError extends Error {
	constructor({ version }: { version: unknown }) {
		super(`Unsupported meter state version: ${String(version)}`);
		this.name = "UnsupportedMeterStateVersionError";
	}
}

export const DEFAULT_DEDUPE_CAPACITY = 10_000;

export const createMeterState = ({
	dedupeCapacity = DEFAULT_DEDUPE_CAPACITY,
}: {
	dedupeCapacity?: number;
} = {}): MeterState => ({
	version: METER_STATE_VERSION,
	customers: {},
	dedupe: { capacity: Math.max(1, dedupeCapacity), ids: [] },
});

export const readFeatureMeter = ({
	state,
	orgId,
	env,
	customerId,
	featureId,
}: {
	state: MeterState;
	orgId: string;
	env: string;
	customerId: string;
	featureId: string;
}): FeatureMeter | undefined =>
	state.customers[meterSubjectKeyOf({ orgId, env, customerId })]?.[featureId];

export const deserializeMeterState = ({
	serialized,
}: {
	serialized: string;
}): MeterState => {
	const parsed = JSON.parse(serialized) as Partial<MeterState>;
	if (parsed.version !== METER_STATE_VERSION) {
		throw new UnsupportedMeterStateVersionError({ version: parsed.version });
	}

	return {
		version: METER_STATE_VERSION,
		customers: parsed.customers ?? {},
		dedupe: {
			capacity: parsed.dedupe?.capacity ?? DEFAULT_DEDUPE_CAPACITY,
			ids: parsed.dedupe?.ids ?? [],
		},
	};
};
