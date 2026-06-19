import type {
	AttachBillingContext,
	AttachParamsV1,
	BillingContext,
	BillingPlan,
	BillingResult,
	CheckoutAction,
	CreateScheduleBillingContext,
	CreateScheduleParamsV0,
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
	T extends
		| AttachBillingContext
		| CreateScheduleBillingContext
		| UpdateSubscriptionBillingContext,
>({
	ctx,
	action,
	params,
	billingContext,
	billingPlan,
	expiresInMs,
}: {
	ctx: AutumnContext;
	action: CheckoutAction;
	params: AttachParamsV1 | CreateScheduleParamsV0 | UpdateSubscriptionV1Params;
	billingContext: T;
	billingPlan: BillingPlan;
	expiresInMs?: number;
}): Promise<CreateAutumnCheckoutResult<T>> {
	const { checkout } = await billingPlanToAutumnCheckout({
		ctx,
		action,
		params,
		billingContext,
		billingPlan,
		expiresInMs,
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
