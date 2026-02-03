import type {
	BillingContext,
	FullCustomer,
	FullProduct,
	TrialContext,
} from "@autumn/shared";

export interface CreateCustomerContextFree {
	fullCustomer: FullCustomer;
	fullProducts: FullProduct[];
	currentEpochMs: number;
	trialContext?: TrialContext;
	hasPaidProducts: boolean;
	billingContext?: BillingContext;
}

export type CreateCustomerContext = CreateCustomerContextFree;
