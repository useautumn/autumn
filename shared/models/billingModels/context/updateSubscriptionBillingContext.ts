import type {
	CancelAction,
	Entitlement,
	FullCusProduct,
	FullProduct,
	Price,
	StripeBillingContextOverride,
} from "@autumn/shared";
import type { BillingContext, BillingVersion } from "./billingContext";

export interface UpdateSubscriptionBillingContext extends BillingContext {
	customerProduct: FullCusProduct; // target customer product
	defaultProduct?: FullProduct; // for cancel flows
	cancelAction?: CancelAction; // for cancel flows
}

export interface UpdateSubscriptionBillingContextOverrides {
	productContext?: {
		fullProduct: FullProduct;
		customerProduct: FullCusProduct;
		customPrices: Price[];
		customEnts: Entitlement[];
	};

	stripeBillingContext?: StripeBillingContextOverride;

	billingVersion?: BillingVersion;
}
