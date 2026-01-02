import type { SubscriptionUpdateV0Params } from "@shared/index";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { AutumnBillingPlan, StripeBillingPlan } from "../../billingPlan";
import { buildStripeInvoiceAction } from "../../providers/stripe/actionBuilders/buildStripeInvoiceAction";
import { buildStripeSubscriptionAction } from "../../providers/stripe/actionBuilders/buildStripeSubscriptionAction";
import type { UpdateSubscriptionContext } from "../fetch/updateSubscriptionContextSchema";

export const evaluateSubscriptionUpdatePlan = ({
	ctx,
	updateSubscriptionContext,
	params,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	updateSubscriptionContext: UpdateSubscriptionContext;
	params: SubscriptionUpdateV0Params;
	autumnBillingPlan: AutumnBillingPlan;
}): StripeBillingPlan => {
	const updatedCustomerProducts = autumnBillingPlan.updateCustomerProduct
		? [autumnBillingPlan.updateCustomerProduct]
		: [];

	const stripeSubscriptionAction = buildStripeSubscriptionAction({
		ctx,
		billingContext: updateSubscriptionContext,
		updatedCustomerProducts,
	});

	const invoiceModeEnabled = params.invoice === true;

	const stripeInvoiceAction = buildStripeInvoiceAction({
		autumnLineItems: autumnBillingPlan.autumnLineItems,
		invoiceMode: invoiceModeEnabled
			? {
					finalizeInvoice: params.finalize_invoice === true,
					enableProductImmediately:
						params.enable_product_immediately !== false,
				}
			: undefined,
	});

	return {
		subscriptionAction: stripeSubscriptionAction,
		invoiceAction: stripeInvoiceAction,
	};
};
