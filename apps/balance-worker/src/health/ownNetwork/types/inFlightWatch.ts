export type InFlightWatch = {
	track<Value>(work: () => Promise<Value>): Promise<Value>;
	takeLongestMs(params: { now: number }): number | null;
};
