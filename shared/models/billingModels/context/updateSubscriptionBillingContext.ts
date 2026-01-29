import type { CancelAction, FullCusProduct, FullProduct } from "@autumn/shared";
import type { BillingContext } from "./billingContext";

export interface UpdateSubscriptionBillingContext extends BillingContext {
	customerProduct: FullCusProduct; // target customer product
	defaultProduct?: FullProduct; // for cancel flows
	cancelAction?: CancelAction; // for cancel flows
}
