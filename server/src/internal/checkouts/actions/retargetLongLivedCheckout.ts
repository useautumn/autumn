import type {
	AttachParamsV1,
	BillingContext,
	BillingResult,
	Checkout,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingResultToResponse } from "@/internal/billing/v2/utils/billingResult/billingResultToResponse";
import { updateCheckoutDbAndCache } from "./updateDbAndCache";

/** Points a long-lived link at a re-attached plan, so the same URL sells the edited plan. */
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
}) =>
	updateCheckoutDbAndCache({
		ctx,
		oldCheckout: checkout,
		updates: {
			params: { ...params, long_lived_checkout: true },
			response: billingResultToResponse({ billingContext, billingResult }),
		},
	});
