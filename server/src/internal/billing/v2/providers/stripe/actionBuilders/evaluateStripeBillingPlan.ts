import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildStripeSubscriptionScheduleAction } from "@/internal/billing/v2/providers/stripe/actionBuilders/buildStripeSubscriptionScheduleAction";
import { shouldCreateManualStripeInvoice } from "@/internal/billing/v2/providers/stripe/utils/invoices/shouldCreateManualStripeInvoice";
import { autumnBillingPlanToFinalFullCustomer } from "@/internal/billing/v2/utils/autumnBillingPlanToFinalFullCustomer";
import type { BillingContext } from "../../../billingContext";
import { buildStripeInvoiceAction } from "../../../providers/stripe/actionBuilders/buildStripeInvoiceAction";
import { buildStripeInvoiceItemsAction } from "../../../providers/stripe/actionBuilders/buildStripeInvoiceItemsAction";
import { buildStripeSubscriptionAction } from "../../../providers/stripe/actionBuilders/buildStripeSubscriptionAction";
import type {
	AutumnBillingPlan,
	StripeBillingPlan,
	StripeInvoiceAction,
	StripeInvoiceItemsAction,
} from "../../../types/billingPlan";
import { initStripeResourcesForBillingPlan } from "../utils/common/initStripeResourcesForProducts";

export const evaluateStripeBillingPlan = async ({
	ctx,
	billingContext,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<StripeBillingPlan> => {
	await initStripeResourcesForBillingPlan({
		ctx,
		autumnBillingPlan,
		billingContext,
	});

	const finalFullCustomer = autumnBillingPlanToFinalFullCustomer({
		billingContext,
		autumnBillingPlan,
	});

	const stripeSubscriptionAction = buildStripeSubscriptionAction({
		ctx,
		billingContext,
		autumnBillingPlan,
		finalCustomerProducts: finalFullCustomer.customer_products,
	});

	const { lineItems } = autumnBillingPlan;

	const createManualInvoice = shouldCreateManualStripeInvoice({
		billingContext,
		stripeSubscriptionAction,
	});

	let stripeInvoiceAction: StripeInvoiceAction | undefined;
	let stripeInvoiceItemsAction: StripeInvoiceItemsAction | undefined;
	if (createManualInvoice && lineItems) {
		stripeInvoiceAction = buildStripeInvoiceAction({
			lineItems,
		});

		stripeInvoiceItemsAction = buildStripeInvoiceItemsAction({
			lineItems,
			billingContext,
		});
	}

	// Build stripe subscription schedule action
	const stripeSubscriptionScheduleAction =
		buildStripeSubscriptionScheduleAction({
			ctx,
			billingContext,
			finalCustomerProducts: finalFullCustomer.customer_products,
			trialEndsAt: billingContext.trialContext?.trialEndsAt ?? undefined,
		});

	return {
		subscriptionAction: stripeSubscriptionAction,
		invoiceAction: stripeInvoiceAction,
		invoiceItemsAction: stripeInvoiceItemsAction,
		subscriptionScheduleAction: stripeSubscriptionScheduleAction,
	};
};
