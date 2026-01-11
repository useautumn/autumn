import type {
	FullCusEntWithFullCusProduct,
	FullCustomer,
	SortCusEntParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { DeductionUpdate } from "./deductionUpdate";
import type { FeatureDeduction } from "./featureDeduction.js";

/** Behavior options for deduction */
export type DeductionOptions = {
	overageBehaviour?: "cap" | "reject" | "allow";
	addToAdjustment?: boolean;
	skipAdditionalBalance?: boolean;
	alterGrantedBalance?: boolean;
	sortParams?: SortCusEntParams;
};

/** Core params for deduction (shared by Redis & Postgres) */
export type DeductionParams = {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	entityId?: string;
	deductions: FeatureDeduction[];
	options?: DeductionOptions;
};

/** Result from deduction (same for Redis & Postgres) */
export type DeductionResult = {
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
	add_to_adjustment: boolean;
	max_balance: number;
};

/** Prepared input for executing a feature deduction */
export type PreparedFeatureDeduction = {
	customerEntitlements: FullCusEntWithFullCusProduct[];
	customerEntitlementDeductions: CustomerEntitlementDeduction[];
	rolloverIds: string[];
	// cusEnts: FullCusEntWithFullCusProduct[];
	// cusEntInput: CusEntDeductionInput[];
	// rolloverIds: string[];
	// cusEntIds: string[];
	// unlimited: boolean;
	// unlimitedFeatureIds: string[];
};

/** Result from Postgres deduction */
export type PostgresDeductionResult = {
	updates: Record<string, DeductionUpdate>;
	remaining: number;
};
