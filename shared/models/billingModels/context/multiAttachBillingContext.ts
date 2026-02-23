import type { Entitlement, FeatureOptions, Price } from "@autumn/shared";
import type { FullProduct } from "../../productModels/productModels";
import type { CheckoutMode } from "./attachBillingContext";
import type { BillingContext } from "./billingContext";

export interface MultiAttachProductContext {
	fullProduct: FullProduct;
	customPrices: Price[];
	customEnts: Entitlement[];
	featureQuantities: FeatureOptions[];
}

export interface MultiAttachBillingContext extends BillingContext {
	productContexts: MultiAttachProductContext[];
	checkoutMode: CheckoutMode;
}
