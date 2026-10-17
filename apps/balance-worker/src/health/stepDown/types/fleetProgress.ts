export type FleetProgress = {
	highWatermarks: ReadonlyMap<number, bigint>;
	nextOffsets: ReadonlyMap<number, bigint>;
};

export type TimedFleetProgress = FleetProgress & { readStartedAt: number };

export type FleetProgressVerdict = {
	ok: boolean;
	active: number;
	keptUp: number;
};

export type FleetCheck =
	| { judged: false }
	| { judged: true; verdict: FleetProgressVerdict };
