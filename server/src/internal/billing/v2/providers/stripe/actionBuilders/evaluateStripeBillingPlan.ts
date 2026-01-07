import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildStripeSubscriptionScheduleAction } from "@/internal/billing/v2/providers/stripe/actionBuilders/buildStripeSubscriptionScheduleAction";
import { autumnBillingPlanToFinalFullCustomer } from "@/internal/billing/v2/utils/autumnBillingPlanToFinalFullCustomer";
import type { BillingContext } from "../../../billingContext";
import { buildStripeInvoiceAction } from "../../../providers/stripe/actionBuilders/buildStripeInvoiceAction";
import { buildStripeInvoiceItemsAction } from "../../../providers/stripe/actionBuilders/buildStripeInvoiceItemsAction";
import { buildStripeSubscriptionAction } from "../../../providers/stripe/actionBuilders/buildStripeSubscriptionAction";
import type {
	AutumnBillingPlan,
	StripeBillingPlan,
} from "../../../types/billingPlan";

export const evaluateStripeBillingPlan = ({
	ctx,
	billingContext,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}): StripeBillingPlan => {
	const { autumnLineItems } = autumnBillingPlan;

	const finalFullCustomer = autumnBillingPlanToFinalFullCustomer({
		billingContext,
		autumnBillingPlan,
	});

	const stripeSubscriptionAction = buildStripeSubscriptionAction({
		ctx,
		billingContext,
		finalCustomerProducts: finalFullCustomer.customer_products,
	});

	const stripeInvoiceAction = buildStripeInvoiceAction({
		lineItems: autumnLineItems,
	});

	const stripeInvoiceItemsAction = buildStripeInvoiceItemsAction({
		lineItems: autumnLineItems,
		billingContext,
	});

	// Build stripe subscription schedule action
	const stripeSubscriptionScheduleAction =
		buildStripeSubscriptionScheduleAction({
			ctx,
			billingContext,
			finalCustomerProducts: finalFullCustomer.customer_products,
			trialEndsAt: autumnBillingPlan.freeTrialPlan?.trialEndsAt,
			nowMs: billingContext.currentEpochMs,
		});

	return {
		subscriptionAction: stripeSubscriptionAction,
		invoiceAction: stripeInvoiceAction,
		invoiceItemsAction: stripeInvoiceItemsAction,
		subscriptionScheduleAction: stripeSubscriptionScheduleAction,
	};
};
