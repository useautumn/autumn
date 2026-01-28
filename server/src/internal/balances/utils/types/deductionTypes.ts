import type {
	CustomerEntitlementFilters,
	FullCusEntWithFullCusProduct,
	FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { DeductionUpdate } from "./deductionUpdate";
import type { FeatureDeduction } from "./featureDeduction.js";

/** Behavior options for deduction */
export type DeductionOptions = {
	overageBehaviour?: "cap" | "reject" | "allow";
	alterGrantedBalance?: boolean;
	customerEntitlementFilters?: CustomerEntitlementFilters;

	// only for resolved
	paidAllocated?: boolean;

	/** @deprecated skipAdditionalBalance is deprecated and will be removed in a future release. */
	skipAdditionalBalance?: boolean;
};

/** Core params for deduction (shared by Redis & Postgres) */
type DeductionParams = {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	entityId?: string;
	deductions: FeatureDeduction[];
	options?: DeductionOptions;
};

/** Result from deduction (same for Redis & Postgres) */
type DeductionResult = {
	oldFullCus: FullCustomer;
	fullCus: FullCustomer | undefined;
	isPaidAllocated: boolean;
	actualDeductions: Record<string, number>;
	remainingAmounts: Record<string, number>;
	modifiedCusEntIds: string[];
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

/** Prepared input for executing a feature deduction */
export type PreparedFeatureDeduction = {
	customerEntitlements: FullCusEntWithFullCusProduct[];
	customerEntitlementDeductions: CustomerEntitlementDeduction[];
	rolloverIds: string[];
	unlimitedFeatureIds: string[];
};

/** Result from Postgres deduction */
type PostgresDeductionResult = {
	updates: Record<string, DeductionUpdate>;
	remaining: number;
};
