import type {
	CustomerEntitlementFilters,
	DbSpendLimit,
	FullCusEntWithFullCusProduct,
	UsageWindowLimit,
} from "@autumn/shared";

/** Behavior options for deduction */
export type DeductionOptions = {
	overageBehaviour?: "cap" | "reject" | "allow";
	/** The triggering event's properties; filtered usage limits only apply when these match. */
	eventProperties?: Record<string, unknown> | null;
	alterGrantedBalance?: boolean;
	customerEntitlementFilters?: CustomerEntitlementFilters;

	// only for resolved
	paidAllocatedV1?: boolean;

	triggerAutoTopUp?: boolean;

	/** @deprecated skipAdditionalBalance is deprecated and will be removed in a future release. */
	skipAdditionalBalance?: boolean;
};

/** Input for a single entitlement in the deduction script (Lua/SQL) */
export type CustomerEntitlementDeduction = {
	customer_entitlement_id: string;
	credit_cost: number;
	feature_id: string;
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
	spendLimitByFeatureId?: Record<string, DbSpendLimit>;
	usageBasedCusEntIdsByFeatureId?: Record<string, string[]>;
	// Resolved windowed usage-limit caps, enforced inside the deduction script.
	usageWindowLimits?: UsageWindowLimit[];
	// Distinct capped feature ids: their balance hashes carry the
	// `_usage_windows` counter field, so their keys must be declared in KEYS[]
	// even when no deduction entry references them.
	usageWindowFeatureIds?: string[];
	// rolloverIds: string[];
	rollovers: RolloverDeduction[];
	unlimitedFeatureIds: string[];
	// Chosen unlimited cusEnt to attribute events to when the deduction
	// short-circuits via unlimitedFeatureIds. Prefers a cusEnt matching the
	// tracked feature over a credit-system parent. Undefined when no
	// unlimited cusEnt is present.
	unlimitedCusEnt?: FullCusEntWithFullCusProduct;
	lock?: {
		enabled: true;
		lock_id?: string;
		hashed_key?: string;
		expires_at?: number;
		redis_receipt_key: string;
		created_at: number;
		ttl_at: number;
	};
};
