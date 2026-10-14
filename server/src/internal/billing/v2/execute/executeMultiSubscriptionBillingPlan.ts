import type {
	AutumnBillingPlan,
	BillingContext,
	FullCustomer,
	StripeBillingPlan,
	StripeBillingPlanResult,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan";
import { insertPendingCustomerProducts } from "@/internal/billing/v2/execute/pendingCustomerProducts/insertPendingCustomerProducts";
import { executeStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/execute/executeStripeBillingPlan";
import { sendBillingUpdatedWebhook } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/sendBillingUpdatedWebhook";
import { billingPlanToSendProductsUpdated } from "@/internal/billing/v2/workflows/sendProductsUpdated/billingPlanToSendProductsUpdated";

export type SubscriptionScopedStripePlan = {
	billingContext: BillingContext;
	stripeBillingPlan: StripeBillingPlan;
	autumnBillingPlan?: AutumnBillingPlan;
};

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

	const awaitingPayment =
		stripeResults.length > 0 &&
		stripeResults.every((result) => result.deferred);

	if (awaitingPayment && stripeResults[0].deferredMetadataId) {
		await insertPendingCustomerProducts({
			ctx,
			autumnBillingPlan,
			metadataId: stripeResults[0].deferredMetadataId,
		});
		return stripeResults;
	}

	const primaryStripeResult = stripeResults[0];
	const { allocationsAdjusted } = await executeAutumnBillingPlan({
		emitsBillingUpdated: true,
		ctx,
		autumnBillingPlan,
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
		allocationsAdjusted,
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
