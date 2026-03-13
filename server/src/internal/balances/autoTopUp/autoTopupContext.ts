import type {
	AutoTopup,
	AutoTopupLimitState,
	BillingContext,
	FullCusEntWithFullCusProduct,
} from "@autumn/shared";

export interface AutoTopupContext extends BillingContext {
	autoTopupConfig: AutoTopup;
	customerEntitlement: FullCusEntWithFullCusProduct; // The one-off prepaid cusEnt being topped up

	limitState: AutoTopupLimitState;
}
