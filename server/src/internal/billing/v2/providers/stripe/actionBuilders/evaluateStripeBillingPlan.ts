import type {
	AutumnBillingPlan,
	BillingContext,
	CheckoutMode,
	StripeBillingPlan,
	StripeCheckoutSessionAction,
	StripeInvoiceAction,
	StripeInvoiceItemsAction,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildStripeSubscriptionScheduleAction } from "@/internal/billing/v2/providers/stripe/actionBuilders/buildStripeSubscriptionScheduleAction";
import { shouldCreateManualStripeInvoice } from "@/internal/billing/v2/providers/stripe/utils/invoices/shouldCreateManualStripeInvoice";
import { autumnBillingPlanToFinalFullCustomer } from "@/internal/billing/v2/utils/autumnBillingPlanToFinalFullCustomer";
import { buildStripeCheckoutSessionAction } from "../../../providers/stripe/actionBuilders/buildStripeCheckoutSessionAction";
import { buildStripeInvoiceAction } from "../../../providers/stripe/actionBuilders/buildStripeInvoiceAction";
import { buildStripeInvoiceItemsAction } from "../../../providers/stripe/actionBuilders/buildStripeInvoiceItemsAction";
import { buildStripeSubscriptionAction } from "../../../providers/stripe/actionBuilders/buildStripeSubscriptionAction";
import { initStripeResourcesForBillingPlan } from "../utils/common/initStripeResourcesForProducts";

export const evaluateStripeBillingPlan = async ({
	ctx,
	billingContext,
	autumnBillingPlan,
	checkoutMode,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	autumnBillingPlan: AutumnBillingPlan;
	checkoutMode?: CheckoutMode;
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

	// Build stripe subscription schedule action
	const {
		scheduleAction: stripeSubscriptionScheduleAction,
		subscriptionCancelAt,
	} = buildStripeSubscriptionScheduleAction({
		ctx,
		billingContext,
		autumnBillingPlan,
		finalCustomerProducts: finalFullCustomer.customer_products,
		trialEndsAt: billingContext.trialContext?.trialEndsAt ?? undefined,
	});

	const stripeSubscriptionAction = buildStripeSubscriptionAction({
		ctx,
		billingContext,
		autumnBillingPlan,
		finalCustomerProducts: finalFullCustomer.customer_products,
		stripeSubscriptionScheduleAction,
		subscriptionCancelAt,
	});

	const { lineItems } = autumnBillingPlan;

	const createManualInvoice = shouldCreateManualStripeInvoice({
		billingContext,
		autumnBillingPlan,
		stripeSubscriptionAction,
	});

	// Build checkout session action if checkout mode is stripe_checkout
	let stripeCheckoutSessionAction: StripeCheckoutSessionAction | undefined;
	if (checkoutMode === "stripe_checkout") {
		stripeCheckoutSessionAction = buildStripeCheckoutSessionAction({
			ctx,
			billingContext,
			finalCustomerProducts: finalFullCustomer.customer_products,
			autumnBillingPlan,
		});
	}

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

	return {
		// If checkout session action is present, don't include subscription action
		// (checkout will create the subscription)
		subscriptionAction: stripeCheckoutSessionAction
			? undefined
			: stripeSubscriptionAction,
		invoiceAction: stripeInvoiceAction,
		invoiceItemsAction: stripeInvoiceItemsAction,
		subscriptionScheduleAction: stripeSubscriptionScheduleAction,
		checkoutSessionAction: stripeCheckoutSessionAction,
	};
};
