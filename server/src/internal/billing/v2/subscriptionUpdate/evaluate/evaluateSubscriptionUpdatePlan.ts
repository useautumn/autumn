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
	const { customerProduct, currentEpochMs } = updateSubscriptionContext;
	const newOptions = params.options || [];

	const customerProductWithNewOptions = {
		...customerProduct,
		options: newOptions,
	};

	const stripeSubscriptionAction = buildStripeSubscriptionAction({
		ctx,
		billingContext: updateSubscriptionContext,
		newCustomerProduct: customerProductWithNewOptions,
		nowMs: currentEpochMs,
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
