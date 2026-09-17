/** One balance the deduction may draw from, with how far it may move decided up front. Customer entitlements and rollovers alike. */
export type DeductionRow = {
	table: "customerEntitlements" | "rollovers";
	id: string;
	/** The stored balance; buckets project forward from it through the deltas. */
	balance: number;
	/** Credits taken per unit of the tracked feature; 1 for the feature's own rows. */
	creditCost: number;
	/** The row may be drawn below zero in the overage bucket. */
	usageAllowed: boolean;
	/** Lowest balance a deduction may leave; null means unbounded. */
	minBalance: number | null;
	/** Highest balance a refund may leave; null means unbounded. */
	maxBalance: number | null;
	/** An infinite sink: absorbs everything, finite siblings stay untouched. */
	unlimited: boolean;
};
