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

	const shouldFinalizeInvoice = params.finalize_invoice !== false;
	const stripeInvoiceAction = shouldFinalizeInvoice
		? buildStripeInvoiceAction({
				autumnLineItems: autumnBillingPlan.autumnLineItems,
			})
		: undefined;

	return {
		subscriptionAction: stripeSubscriptionAction,
		invoiceAction: stripeInvoiceAction,
	};
};
