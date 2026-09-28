import { type BillingContext, BillingVersion } from "@autumn/shared";
import { getOrCreateStripeCustomer } from "@/external/stripe/customers/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getMonthStartAnchorMs } from "@/internal/billing/v2/utils/cycleAnchor/getMonthStartAnchorMs";
import type { CreateCustomerContext } from "../createCustomerContext.js";

/**
 * Setup billing context for Stripe subscription creation.
 * Gets/creates Stripe customer and builds BillingContext.
 *
 * Must be called AFTER executeAutumnCreateCustomerPlan to ensure
 * we have the correct internal_id for Stripe idempotency.
 */
export const setupCreateCustomerBillingContext = async ({
	ctx,
	context,
}: {
	ctx: AutumnContext;
	context: CreateCustomerContext;
}): Promise<BillingContext> => {
	const { fullCustomer, fullProducts, trialContext, currentEpochMs } = context;

	const billingCycleAnchorMs =
		getMonthStartAnchorMs({
			fullProducts,
			startsAt: currentEpochMs,
			trialEndsAt: trialContext?.trialEndsAt,
		}) ?? ("now" as const);

	const stripeCustomer = await getOrCreateStripeCustomer({
		ctx,
		customer: fullCustomer,
	});

	return {
		// remove customer_products from fullCustomer to avoid sending to Stripe
		fullCustomer: {
			...fullCustomer,
			customer_products: [],
		},
		stripeCustomer,
		fullProducts,
		featureQuantities: [],
		currentEpochMs,
		billingCycleAnchorMs,
		resetCycleAnchorMs: billingCycleAnchorMs,
		trialContext,
		customPrices: [],
		customEnts: [],
		isCustom: false,
		billingVersion: BillingVersion.V2,
	};
};
