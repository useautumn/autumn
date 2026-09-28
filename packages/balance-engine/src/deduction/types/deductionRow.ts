import type { CreditRateCard } from "@autumn/shared";

/** One balance the deduction may draw from, with how far it may move decided up front. Customer entitlements and rollovers alike. */
export type DeductionRow = {
	table: "customerEntitlements" | "rollovers";
	id: string;
	/** Which balance on the row: the key in its `entities` map, or null for the `balance` column. */
	entityKey: string | null;
	/** The feature this row's balance is denominated in; spend limits are keyed by it. */
	featureId: string;
	/** The stored balance; buckets project forward from it through the deltas. */
	balance: number;
	/** Credits taken per unit of the tracked feature; 1 for the feature's own rows. */
	creditCost: number;
	/** A graduated or attributed rate: credits per unit depend on the units already charged to this row. */
	rateCard: CreditRateCard | null;
	/** Units already attributed to the rate card's key on the owning row, at the start of the deduction. */
	rateUnits: number;
	/** The customer entitlement that carries usage attribution: itself, or the rollover's owner. */
	ownerId: string;
	/** The row may be drawn below zero in the overage bucket: its own flag, a control, or unlimited. */
	usageAllowed: boolean;
	/** A free allocated grant may also run over, unless the draw rejects; decided per draw by `isUsageAllowed`. */
	freeAllocated: boolean;
	/** Lowest balance a deduction may leave; null means unbounded. */
	minBalance: number | null;
	/** Highest balance a refund may leave; null means unbounded. */
	maxBalance: number | null;
	/** An infinite sink: absorbs everything, finite siblings stay untouched. */
	unlimited: boolean;
	/** Free usage on this row: its rollovers are never drawn. */
	skipsRollovers: boolean;
};
