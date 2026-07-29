import type {
	AutoTopupParams,
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
	autoTopups?: AutoTopupParams[];
}

export type CreateCustomerContext = CreateCustomerContextFree;
