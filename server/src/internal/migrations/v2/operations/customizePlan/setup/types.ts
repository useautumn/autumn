import type {
	FullCusProduct,
	UpdateSubscriptionBillingContext,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";

export interface CustomizePlanProductContext {
	customerProduct: FullCusProduct;
	params: UpdateSubscriptionV1Params;
	billingContext: UpdateSubscriptionBillingContext;
}
