import type {
	FullCusProduct,
	UpdateSubscriptionBillingContext,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";

export interface UpdatePlanProductContext {
	customerProduct: FullCusProduct;
	params: UpdateSubscriptionV1Params;
	billingContext: UpdateSubscriptionBillingContext;
}
