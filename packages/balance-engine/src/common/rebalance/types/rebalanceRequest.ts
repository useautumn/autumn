/** A purchase of `quantity` units of a feature. */
export type RebalanceRequest = {
	featureId: string;
	/** The purchased row: it must be held, and only rows at its level (customer or entity) are brought up to 0. */
	customerEntitlementId: string;
	quantity: number;
	/** The row credited with what is left: the purchased row, a grant the plan inserted, or null for the first row brought up to 0. */
	creditedCustomerEntitlementId: string | null;
	now: number;
};
