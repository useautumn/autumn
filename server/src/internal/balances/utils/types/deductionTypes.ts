import type {
	CustomerEntitlementFilters,
	FullCusEntWithFullCusProduct,
} from "@autumn/shared";

/** Behavior options for deduction */
export type DeductionOptions = {
	overageBehaviour?: "cap" | "reject" | "allow";
	alterGrantedBalance?: boolean;
	customerEntitlementFilters?: CustomerEntitlementFilters;

	// only for resolved
	paidAllocated?: boolean;

	triggerAutoTopUp?: boolean;

	/** @deprecated skipAdditionalBalance is deprecated and will be removed in a future release. */
	skipAdditionalBalance?: boolean;
};

/** Input for a single entitlement in the deduction script (Lua/SQL) */
export type CustomerEntitlementDeduction = {
	customer_entitlement_id: string;
	credit_cost: number;
	entity_feature_id: string | null;
	usage_allowed: boolean;
	min_balance: number | undefined;
	max_balance: number;
};

/** Rollover with credit cost for deduction */
export type RolloverDeduction = {
	id: string;
	credit_cost: number;
};

/** Prepared input for executing a feature deduction */
export type PreparedFeatureDeduction = {
	customerEntitlements: FullCusEntWithFullCusProduct[];
	customerEntitlementDeductions: CustomerEntitlementDeduction[];
	// rolloverIds: string[];
	rollovers: RolloverDeduction[];
	unlimitedFeatureIds: string[];
	lock?: {
		enabled: true;
		key?: string;
		hashed_key?: string;
		expires_at?: string;
		redis_receipt_key: string;
		created_at: number;
	};
};
