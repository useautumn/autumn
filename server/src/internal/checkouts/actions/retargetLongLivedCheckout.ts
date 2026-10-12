import {
	type AttachParamsV1,
	type BillingContext,
	type BillingResult,
	type Checkout,
	CheckoutStatus,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingResultToResponse } from "@/internal/billing/v2/utils/billingResult/billingResultToResponse";
import { updateCheckoutDbAndCache } from "./updateDbAndCache";

/**
 * Points a long-lived link at a re-attached plan so the same URL sells the edit.
 * Closes the link instead when the edited plan was attached without a checkout.
 */
export const retargetLongLivedCheckout = async ({
	ctx,
	checkout,
	params,
	billingContext,
	billingResult,
}: {
	ctx: AutumnContext;
	checkout: Checkout;
	params: AttachParamsV1;
	billingContext: BillingContext;
	billingResult: BillingResult;
}) => {
	if (!billingResult.stripe.stripeCheckoutSession) {
		await updateCheckoutDbAndCache({
			ctx,
			oldCheckout: checkout,
			updates: { status: CheckoutStatus.Completed, completed_at: Date.now() },
		});
		return null;
	}

	return updateCheckoutDbAndCache({
		ctx,
		oldCheckout: checkout,
		updates: {
			params: { ...params, long_lived_checkout: true },
			response: billingResultToResponse({ billingContext, billingResult }),
		},
	});
};
