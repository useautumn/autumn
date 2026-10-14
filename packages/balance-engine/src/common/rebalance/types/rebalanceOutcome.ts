import type { RowChange } from "../../../models/mutation/rowChange.js";

export type RebalanceDelta = {
	customerEntitlementId: string;
	delta: number;
};

export type RebalanceOutcome = {
	deltas: RebalanceDelta[];
	changes: RowChange[];
};
