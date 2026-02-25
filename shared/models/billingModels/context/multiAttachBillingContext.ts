import type {
	Entitlement,
	FeatureOptions,
	FullCusProduct,
	Price,
} from "@autumn/shared";
import type { FullProduct } from "../../productModels/productModels";
import type { CheckoutMode } from "./attachBillingContext";
import type { BillingContext } from "./billingContext";

export interface MultiAttachProductContext {
	fullProduct: FullProduct;
	customPrices: Price[];
	customEnts: Entitlement[];
	featureQuantities: FeatureOptions[];
	/** The existing active product in the same group being transitioned from (at most one across all plans). */
	currentCustomerProduct?: FullCusProduct;
	/** A previously scheduled product in the same group to delete. */
	scheduledCustomerProduct?: FullCusProduct;
}

export interface MultiAttachBillingContext extends BillingContext {
	productContexts: MultiAttachProductContext[];
	checkoutMode: CheckoutMode;
}
