import type {
	AutoTopup,
	AutoTopupLimitState,
	BillingContext,
	FullCusEntWithFullCusProduct,
} from "@autumn/shared";

export interface AutoTopupContext extends BillingContext {
	autoTopupConfig: AutoTopup;
	customerEntitlement: FullCusEntWithFullCusProduct;

	limitState: AutoTopupLimitState;
}
