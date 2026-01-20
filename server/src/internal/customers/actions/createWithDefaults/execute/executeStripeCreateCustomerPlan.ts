import type Stripe from "stripe";
import { getOrCreateStripeCustomer } from "@/external/stripe/customers/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan.js";
import { executeStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/execute/executeStripeBillingPlan.js";
import { logStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/logs/logStripeBillingPlan.js";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types/billingPlan.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { initSubscriptionFromStripe } from "@/internal/subscriptions/utils/initSubscriptionFromStripe.js";
import type { CreateCustomerContext } from "../createCustomerContext.js";

/**
 * Execute the Stripe part of customer creation.
 *
 * 1. Get or create Stripe customer (idempotent based on internal_id)
 * 2. Evaluate Stripe billing plan
 * 3. Execute Stripe billing plan (create subscription)
 *
 * Must be called AFTER executeAutumnCreateCustomerPlan succeeds to ensure
 * we have the correct internal_id for idempotency.
 */
export const executeStripeCreateCustomerPlan = async ({
	ctx,
	context,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	context: CreateCustomerContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<Stripe.Subscription | undefined> => {
	const { fullCustomer, fullProducts, trialContext } = context;

	// 1. Get or create Stripe customer (idempotent)
	const stripeCustomer = await getOrCreateStripeCustomer({
		ctx,
		customer: fullCustomer,
	});

	// 2. Build billing context with Stripe customer
	const billingContext = {
		fullCustomer,
		stripeCustomer,
		fullProducts,
		featureQuantities: [],
		currentEpochMs: Date.now(),
		billingCycleAnchorMs: "now" as const,
		resetCycleAnchorMs: "now" as const,
		trialContext,
		customPrices: [],
		customEnts: [],
		isCustom: false,
	};

	// 3. Evaluate Stripe billing plan
	const stripeBillingPlan = await evaluateStripeBillingPlan({
		ctx,
		billingContext,
		autumnBillingPlan,
	});

	logStripeBillingPlan({
		ctx,
		stripeBillingPlan,
		billingContext,
	});

	// 4. Execute Stripe billing plan
	const { stripeSubscription } = await executeStripeBillingPlan({
		ctx,
		billingPlan: { autumn: autumnBillingPlan, stripe: stripeBillingPlan },
		billingContext,
	});

	if (stripeSubscription) {
		for (const cusProduct of autumnBillingPlan.insertCustomerProducts) {
			await CusProductService.update({
				db: ctx.db,
				cusProductId: cusProduct.id,
				updates: { subscription_ids: cusProduct.subscription_ids },
			});
		}

		context.fullCustomer.subscriptions = [
			initSubscriptionFromStripe({ ctx, stripeSubscription }),
		];

		context.fullCustomer.customer_products =
			autumnBillingPlan.insertCustomerProducts;
	}

	return stripeSubscription;
};
