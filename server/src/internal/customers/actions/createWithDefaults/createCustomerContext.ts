import type { FullCustomer, FullProduct } from "@autumn/shared";
import type { TrialContext } from "@/internal/billing/v2/billingContext";

export interface CreateCustomerContextFree {
	fullCustomer: FullCustomer;
	fullProducts: FullProduct[];
	currentEpochMs: number;
	trialContext?: TrialContext;
	hasPaidProducts: boolean;
}

export type CreateCustomerContext = CreateCustomerContextFree;
