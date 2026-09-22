/** How far below the bookmark a starting replay reads, only to refill the partition's recent commands. */
export type ReplayWindow = {
	windowMs: number;
	lookupTimeoutMs: number;
	now(): number;
};
