export type ReplayWindow = {
	windowMs: number;
	lookupTimeoutMs: number;
	now(): number;
};
