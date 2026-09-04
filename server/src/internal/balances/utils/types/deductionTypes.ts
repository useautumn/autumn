import type {
	CustomerEntitlementFilters,
	DbSpendLimit,
	EventProperties,
	FullCusEntWithFullCusProduct,
	UsageWindowLimit,
} from "@autumn/shared";
import type { CreditRateCard } from "@/internal/features/creditSystemUtils.js";

/** Behavior options for deduction */
export type DeductionOptions = {
	// "overflow": deduct the entire amount — no balance floor, bypasses usage
	// windows — but monetary spend limits still clamp (unlike "allow").
	overageBehaviour?: "cap" | "reject" | "allow" | "overflow";
	/** The triggering event's properties; filtered usage limits only apply when these match. */
	eventProperties?: EventProperties;
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
	rate_card?: CreditRateCard;
	feature_id: string;
	entity_feature_id: string | null;
	usage_allowed: boolean;
	min_balance: number | undefined;
	max_balance: number | undefined;
	// Unlimited entitlements act as an infinite sink: usage_allowed with no
	// balance clamps in either direction, so balance drifts negative as a
	// usage counter and refunds can move it back up freely.
	unlimited?: boolean;
};

/** Rollover with credit cost for deduction */
export type RolloverDeduction = {
	id: string;
	credit_cost: number;
	rate_card?: CreditRateCard;
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
	lock?: {
		enabled: true;
		lock_id?: string;
		hashed_key?: string;
		expires_at?: number;
		redis_receipt_key: string;
		created_at: number;
		ttl_at: number;
		properties?: Record<string, unknown> | null;
	};
};
