import type {
	AutumnBillingPlan,
	BillingContext,
	FullCustomer,
	StripeBillingPlan,
	StripeBillingPlanResult,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan";
import { executeStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/execute/executeStripeBillingPlan";
import { sendBillingUpdatedWebhook } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/sendBillingUpdatedWebhook";
import { billingPlanToSendProductsUpdated } from "@/internal/billing/v2/workflows/sendProductsUpdated/billingPlanToSendProductsUpdated";

export type SubscriptionScopedStripePlan = {
	billingContext: BillingContext;
	stripeBillingPlan: StripeBillingPlan;
	/** The plan this sub's stripe plan was evaluated from — pairs them for Stripe
	 * execution only. Never executed against the DB; the top-level plan runs once. */
	autumnBillingPlan?: AutumnBillingPlan;
};

/**
 * Execute one merged AutumnBillingPlan whose Stripe changes span multiple
 * subscriptions: one Stripe execution per subscription, then a single Autumn
 * execution and the standard webhook tail. Stripe writes are sequential and
 * NOT transactional across subscriptions — the Autumn plan only executes after
 * every Stripe write succeeds (same failure semantics as migrations).
 */
export const executeMultiSubscriptionBillingPlan = async ({
	ctx,
	autumnBillingPlan,
	stripeBillingPlans,
	primaryBillingContext,
	originalFullCustomer,
	onStripeResult,
	awaitBillingUpdatedWebhook = false,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
	stripeBillingPlans: SubscriptionScopedStripePlan[];
	primaryBillingContext?: BillingContext;
	originalFullCustomer: FullCustomer;
	onStripeResult?: (result: StripeBillingPlanResult) => void;
	awaitBillingUpdatedWebhook?: boolean;
}): Promise<StripeBillingPlanResult[]> => {
	const stripeResults: StripeBillingPlanResult[] = [];
	for (const subscriptionPlan of stripeBillingPlans) {
		const result = await executeStripeBillingPlan({
			ctx,
			billingContext: subscriptionPlan.billingContext,
			billingPlan: {
				autumn: subscriptionPlan.autumnBillingPlan ?? autumnBillingPlan,
				stripe: subscriptionPlan.stripeBillingPlan,
			},
		});
		onStripeResult?.(result);
		stripeResults.push(result);
	}

	const primaryStripeResult = stripeResults[0];
	await executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan,
		fullCustomer: originalFullCustomer,
		stripeInvoice: primaryStripeResult?.stripeInvoice,
		stripeInvoiceItems: primaryStripeResult?.stripeInvoiceItems,
		autumnInvoice: primaryStripeResult?.autumnInvoice,
	});

	if (primaryBillingContext) {
		await billingPlanToSendProductsUpdated({
			ctx,
			autumnBillingPlan,
			billingContext: primaryBillingContext,
		});
	}

	const billingUpdatedPromise = sendBillingUpdatedWebhook({
		ctx,
		autumnBillingPlan,
		originalFullCustomer,
	});
	if (awaitBillingUpdatedWebhook) {
		await billingUpdatedPromise;
	} else {
		void billingUpdatedPromise;
	}

	return stripeResults;
};
