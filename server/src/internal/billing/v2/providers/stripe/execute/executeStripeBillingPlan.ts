import type {
	BillingContext,
	BillingPlan,
	StripeBillingPlanResult,
} from "@autumn/shared";
import { StripeBillingStage } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addStripeSubscriptionScheduleIdToBillingPlan } from "@/internal/billing/v2/execute/addStripeSubscriptionScheduleIdToBillingPlan";
import { executeStripeCheckoutSessionAction } from "@/internal/billing/v2/providers/stripe/execute/executeStripeCheckoutSessionAction";
import { executeStripeInvoiceAction } from "@/internal/billing/v2/providers/stripe/execute/executeStripeInvoiceAction";
import { executeStripeSubscriptionAction } from "@/internal/billing/v2/providers/stripe/execute/executeStripeSubscriptionAction";
import { executeStripeSubscriptionScheduleAction } from "@/internal/billing/v2/providers/stripe/execute/executeStripeSubscriptionScheduleAction";
import { createStripeInvoiceItems } from "@/internal/billing/v2/providers/stripe/utils/invoices/stripeInvoiceOps";

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
		checkoutSessionAction: stripeCheckoutSessionAction,
	} = billingPlan.stripe;

	// Execute checkout session FIRST if present (returns early with deferred result)
	if (stripeCheckoutSessionAction) {
		return executeStripeCheckoutSessionAction({
			ctx,
			billingPlan,
			billingContext,
			checkoutSessionAction: stripeCheckoutSessionAction,
		});
	}

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

	if (isReleaseAction && !resumeAfterSubscriptionAction) {
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
				stripeBillingPlan: billingPlan.stripe,
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
