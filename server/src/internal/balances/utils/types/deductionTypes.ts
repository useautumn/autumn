import type {
	CustomerEntitlementFilters,
	DbSpendLimit,
	EventProperties,
	FullCusEntWithFullCusProduct,
	UsageWindowLimit,
} from "@autumn/shared";
import type { AllocationLuaGate } from "@/internal/balances/allocate/deduction/resolveAllocationLuaGate.js";
import type { CreditRateCard } from "@/internal/features/creditSystemUtils.js";

export type DeductionOptions = {
	overageBehaviour?: "cap" | "reject" | "allow" | "overflow";
	eventProperties?: EventProperties;
	alterGrantedBalance?: boolean;
	countsAllocations?: boolean;
	customerEntitlementFilters?: CustomerEntitlementFilters;

	paidAllocatedV1?: boolean;

	triggerAutoTopUp?: boolean;

	/** @deprecated skipAdditionalBalance is deprecated and will be removed in a future release. */
	skipAdditionalBalance?: boolean;
};

export type OveragePriority = 0 | 1 | 2;

export type CustomerEntitlementDeduction = {
	customer_entitlement_id: string;
	credit_cost: number;
	rate_card?: CreditRateCard;
	feature_id: string;
	entity_feature_id: string | null;
	usage_allowed: boolean;
	overage_priority: OveragePriority;
	min_balance: number | undefined;
	max_balance: number | undefined;
	unlimited?: boolean;
};

export type RolloverDeduction = {
	id: string;
	credit_cost: number;
	rate_card?: CreditRateCard;
};

export type PreparedFeatureDeduction = {
	customerEntitlements: FullCusEntWithFullCusProduct[];
	customerEntitlementDeductions: CustomerEntitlementDeduction[];
	spendLimitByFeatureId?: Record<string, DbSpendLimit>;
	usageBasedCusEntIdsByFeatureId?: Record<string, string[]>;
	usageWindowLimits?: UsageWindowLimit[];
	usageWindowFeatureIds?: string[];
	allocationGates?: Record<string, AllocationLuaGate>;
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
		overage_behavior?: DeductionOptions["overageBehaviour"];
	};
};
