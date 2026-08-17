import type {
	Entitlement,
	FeatureOptions,
	FullCusProduct,
	FullCustomer,
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
	fullCustomer: FullCustomer;
	/** The existing active product in the same group and scope. */
	currentCustomerProduct?: FullCusProduct;
	/** A previously scheduled product in the same group to delete. */
	scheduledCustomerProduct?: FullCusProduct;
	/** User-provided subscription ID for this product. */
	externalId?: string;
	/**
	 * Set by create_schedule for plans in `unscheduled_plans`: they bill with the
	 * immediate phase, but the schedule never ends them or counts them among its
	 * phase products.
	 */
	unscheduled?: boolean;
}

export interface MultiAttachBillingContext extends BillingContext {
	productContexts: MultiAttachProductContext[];
	checkoutMode: CheckoutMode;

	// Resolved billing currency for this multi-attach (requested -> customer -> org default).
	currency?: string;
}
