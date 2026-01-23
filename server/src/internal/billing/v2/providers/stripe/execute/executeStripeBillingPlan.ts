import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import { addStripeSubscriptionScheduleIdToBillingPlan } from "@/internal/billing/v2/execute/addStripeSubscriptionScheduleIdToBillingPlan";
import { executeStripeInvoiceAction } from "@/internal/billing/v2/providers/stripe/execute/executeStripeInvoiceAction";
import { executeStripeSubscriptionAction } from "@/internal/billing/v2/providers/stripe/execute/executeStripeSubscriptionAction";
import { executeStripeSubscriptionScheduleAction } from "@/internal/billing/v2/providers/stripe/execute/executeStripeSubscriptionScheduleAction";
import { createStripeInvoiceItems } from "@/internal/billing/v2/providers/stripe/utils/invoices/stripeInvoiceOps";
import { StripeBillingStage } from "@/internal/billing/v2/types/autumnBillingPlan";
import type { BillingPlan } from "@/internal/billing/v2/types/billingPlan";
import type { StripeBillingPlanResult } from "@/internal/billing/v2/types/billingResult";

export const executeStripeBillingPlan = async ({
	ctx,
	billingPlan,
	billingContext,
	resumeAfter,
}: {
	ctx: AutumnContext;
	billingPlan: BillingPlan;
	billingContext: BillingContext;
	resumeAfter?: StripeBillingStage;
}): Promise<StripeBillingPlanResult> => {
	const {
		subscriptionAction: stripeSubscriptionAction,
		invoiceAction: stripeInvoiceAction,
		invoiceItemsAction: stripeInvoiceItemsAction,
		subscriptionScheduleAction: stripeSubscriptionScheduleAction,
	} = billingPlan.stripe;

	// Collect results from each stage
	let invoiceResult: StripeBillingPlanResult | undefined;
	let subscriptionResult: StripeBillingPlanResult | undefined;
	let stripeSubscription = billingContext.stripeSubscription;

	const resumeAfterInvoiceAction =
		resumeAfter === StripeBillingStage.InvoiceAction;

	const resumeAfterSubscriptionAction =
		resumeAfter === StripeBillingStage.SubscriptionAction;

	if (stripeInvoiceAction && !resumeAfterInvoiceAction) {
		invoiceResult = await executeStripeInvoiceAction({
			ctx,
			billingPlan,
			billingContext,
		});

		if (invoiceResult.deferred) return invoiceResult;
	}

	if (
		stripeInvoiceItemsAction?.createInvoiceItems &&
		!resumeAfterSubscriptionAction
	) {
		await createStripeInvoiceItems({
			ctx,
			invoiceItems: stripeInvoiceItemsAction.createInvoiceItems,
		});
	}

	// For schedule release, we need to release first before updating subscription with cancel_at
	// Otherwise Stripe rejects the cancel_at update while schedule still manages subscription
	const isReleaseAction = stripeSubscriptionScheduleAction?.type === "release";

	if (isReleaseAction) {
		await executeStripeSubscriptionScheduleAction({
			ctx,
			billingContext,
			subscriptionScheduleAction: stripeSubscriptionScheduleAction,
			stripeSubscription,
		});
	}

	if (stripeSubscriptionAction && !resumeAfterSubscriptionAction) {
		subscriptionResult = await executeStripeSubscriptionAction({
			ctx,
			billingPlan,
			billingContext,
		});
		if (subscriptionResult?.deferred) return subscriptionResult;
		stripeSubscription =
			subscriptionResult.stripeSubscription ?? stripeSubscription;
	}

	if (stripeSubscriptionScheduleAction && !isReleaseAction) {
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

	const stripeInvoice =
		subscriptionResult?.stripeInvoice ?? invoiceResult?.stripeInvoice;

	return {
		stripeSubscription: subscriptionResult?.stripeSubscription,
		stripeInvoice,
		requiredAction:
			subscriptionResult?.requiredAction ?? invoiceResult?.requiredAction,
	};
};
