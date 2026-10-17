export type FleetProgress = {
	highWatermarks: ReadonlyMap<number, bigint>;
	nextOffsets: ReadonlyMap<number, bigint>;
};

export type FleetProgressVerdict = {
	ok: boolean;
	active: number;
	keptUp: number;
};
