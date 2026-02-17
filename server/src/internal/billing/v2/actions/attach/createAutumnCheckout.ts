import type {
	AttachBillingContext,
	AttachParamsV1,
	BillingPlan,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingPlanToAutumnCheckout } from "@/internal/billing/v2/utils/billingPlan/billingPlanToAutumnCheckout";
import type { AttachResult } from "./attach";

/**
 * Creates an Autumn checkout session for customer confirmation.
 *
 * Used when checkoutMode === "autumn_checkout" (customer has payment method
 * but redirect_mode is "always", requiring user confirmation before billing).
 */
export async function createAutumnCheckout({
	ctx,
	params,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	params: AttachParamsV1;
	billingContext: AttachBillingContext;
	billingPlan: BillingPlan;
}): Promise<AttachResult> {
	const { checkout } = await billingPlanToAutumnCheckout({
		ctx,
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
