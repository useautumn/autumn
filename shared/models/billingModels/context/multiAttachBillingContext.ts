import type {
	CustomerLicenseQuantity,
	Entitlement,
	FeatureOptions,
	FullCusProduct,
	FullCustomer,
	InsertPlanLicenseSpec,
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
	customerLicenseQuantities?: CustomerLicenseQuantity[];
	insertPlanLicenses?: InsertPlanLicenseSpec[];
	fullCustomer: FullCustomer;
	currentCustomerProduct?: FullCusProduct;
	scheduledCustomerProduct?: FullCusProduct;
	externalId?: string;
	unscheduled?: boolean;
}

export interface MultiAttachBillingContext extends BillingContext {
	productContexts: MultiAttachProductContext[];
	checkoutMode: CheckoutMode;

	currency?: string;
}
