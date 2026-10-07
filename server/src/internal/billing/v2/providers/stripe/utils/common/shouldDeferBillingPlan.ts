import type {
	BillingContext,
	BillingResponseRequiredAction,
} from "@autumn/shared";
import type Stripe from "stripe";
import { isSetPlansBillingContext } from "@/internal/billing/v2/actions/setPlans/utils/persistDeferredSetPlansSchedule";
import { isDeferredInvoiceMode } from "@/internal/billing/v2/utils/billingContext/isDeferredInvoiceMode";
import { isPlanEnabledOnFinalize } from "@/internal/billing/v2/utils/billingContext/isPlanEnabledOnFinalize";

export const shouldDeferBillingPlan = ({
	billingContext,
	latestStripeInvoice,
	requiredAction,
}: {
	billingContext: BillingContext;
	latestStripeInvoice: Stripe.Invoice;
	requiredAction?: BillingResponseRequiredAction;
}): boolean => {
	const deferredInvoiceMode = isDeferredInvoiceMode({
		billingContext,
	});

	if (latestStripeInvoice.status === "paid") return false;

	if (
		latestStripeInvoice.status === "draft" &&
		isPlanEnabledOnFinalize({ billingContext })
	) {
		return true;
	}

	// set_plans declares the state Stripe should hold: on a sub already in dunning it applies now and the invoice stays open.
	const appliesInDunning =
		isSetPlansBillingContext(billingContext) &&
		billingContext.stripeSubscription?.status === "past_due";
	return deferredInvoiceMode || (Boolean(requiredAction) && !appliesInDunning);
};
