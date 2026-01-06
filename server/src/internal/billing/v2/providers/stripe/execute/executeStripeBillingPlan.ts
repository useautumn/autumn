import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import { addStripeSubscriptionScheduleIdToBillingPlan } from "@/internal/billing/v2/execute/addStripeSubscriptionScheduleIdToBillingPlan";
import { executeStripeInvoiceAction } from "@/internal/billing/v2/providers/stripe/execute/executeStripeInvoiceAction";
import { executeStripeSubscriptionAction } from "@/internal/billing/v2/providers/stripe/execute/executeStripeSubscriptionAction";
import { executeStripeSubscriptionScheduleAction } from "@/internal/billing/v2/providers/stripe/execute/executeStripeSubscriptionScheduleAction";
import { createStripeInvoiceItems } from "@/internal/billing/v2/providers/stripe/utils/invoices/stripeInvoiceOps";
import type { BillingPlan } from "@/internal/billing/v2/types/billingPlan";
import type { StripeBillingPlanResult } from "@/internal/billing/v2/types/stripeBillingPlanResult";

export const executeStripeBillingPlan = async ({
	ctx,
	billingPlan,
	billingContext,
	resumeFromDeferred = false,
}: {
	ctx: AutumnContext;
	billingPlan: BillingPlan;
	billingContext: BillingContext;
	resumeFromDeferred?: boolean;
}): Promise<StripeBillingPlanResult> => {
	const { logger } = ctx;
	const {
		subscriptionAction: stripeSubscriptionAction,
		invoiceAction: stripeInvoiceAction,
		invoiceItemsAction: stripeInvoiceItemsAction,
		subscriptionScheduleAction: stripeSubscriptionScheduleAction,
	} = billingPlan.stripe;

	if (stripeInvoiceAction && !resumeFromDeferred) {
		const result = await executeStripeInvoiceAction({
			ctx,
			billingPlan,
			billingContext,
		});

		if (result.deferred) return result;
	}

	if (stripeInvoiceItemsAction?.createInvoiceItems) {
		logger.info(
			"[executeStripeBillingPlan] Creating invoice items for next cycle",
		);
		await createStripeInvoiceItems({
			ctx,
			invoiceItems: stripeInvoiceItemsAction.createInvoiceItems,
		});
	}

	let stripeSubscription: Stripe.Subscription | undefined =
		billingContext.stripeSubscription;

	if (stripeSubscriptionAction) {
		const result = await executeStripeSubscriptionAction({
			ctx,
			billingPlan,
			billingContext,
		});

		if (result?.deferred) return result;

		stripeSubscription = result.stripeSubscription;
	}

	if (stripeSubscriptionScheduleAction) {
		const stripeSubscriptionSchedule =
			await executeStripeSubscriptionScheduleAction({
				ctx,
				billingContext,
				subscriptionScheduleAction: stripeSubscriptionScheduleAction,
				stripeSubscription,
			});

		if (stripeSubscriptionSchedule) {
			addStripeSubscriptionScheduleIdToBillingPlan({
				autumnBillingPlan: billingPlan.autumn,
				stripeSubscriptionScheduleId: stripeSubscriptionSchedule.id,
			});
		}
	}

	return { stripeInvoice: undefined };
};
