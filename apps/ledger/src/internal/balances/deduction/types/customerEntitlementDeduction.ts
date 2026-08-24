// One row of the script's customer_entitlement_deductions: the clamps and cost
// that decide how much this customer entitlement absorbs.
export type CustomerEntitlementDeduction = {
	customer_entitlement_id: string;
	feature_id: string;
	credit_cost: number;
	usage_allowed: boolean;
	min_balance?: number;
	max_balance?: number;
	unlimited?: boolean;
};
