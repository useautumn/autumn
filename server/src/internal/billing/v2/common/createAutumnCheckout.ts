import type {
	AttachBillingContext,
	AttachParamsV1,
	BillingContext,
	BillingPlan,
	BillingResult,
	CheckoutAction,
	UpdateSubscriptionBillingContext,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingPlanToAutumnCheckout } from "@/internal/billing/v2/utils/billingPlan/billingPlanToAutumnCheckout";

export interface CreateAutumnCheckoutResult<T extends BillingContext> {
	billingContext: T;
	billingPlan?: BillingPlan;
	billingResult?: BillingResult;
}

/**
 * Creates an Autumn checkout session for customer confirmation.
 *
 * Used when checkoutMode === "autumn_checkout" (customer has payment method
 * but redirect_mode is "always", requiring user confirmation before billing).
 */
export async function createAutumnCheckout<
	T extends AttachBillingContext | UpdateSubscriptionBillingContext,
>({
	ctx,
	action,
	params,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	action: CheckoutAction;
	params: AttachParamsV1 | UpdateSubscriptionV1Params;
	billingContext: T;
	billingPlan: BillingPlan;
}): Promise<CreateAutumnCheckoutResult<T>> {
	const { checkout } = await billingPlanToAutumnCheckout({
		ctx,
		action,
		params,
		billingContext,
		billingPlan,
	});

	return {
		billingContext,
		billingPlan,
		billingResult: {
			stripe: {},
			autumn: { checkout },
		},
	};
}
