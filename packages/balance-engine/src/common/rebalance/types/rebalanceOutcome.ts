import type { RowChange } from "../../../models/mutation/rowChange.js";

/** What a rebalance added to one row's balance. */
export type RebalanceDelta = {
	customerEntitlementId: string;
	delta: number;
};

/** Every row's delta in order, then the increments that carry them. */
export type RebalanceOutcome = {
	deltas: RebalanceDelta[];
	changes: RowChange[];
};
