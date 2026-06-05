import {
	cusProductToProduct,
	type FeatureOptions,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	type StripeDiscountWithCoupon,
	type TrialContext,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { StripeSubscriptionWithDiscounts } from "@/external/stripe/subscriptions/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupUpdateSubscriptionTrialContext } from "@/internal/billing/v2/actions/updateSubscription/setup/setupUpdateSubscriptionTrialContext.js";
import { setupBillingCycleAnchor } from "@/internal/billing/v2/setup/setupBillingCycleAnchor.js";
import { setupResetCycleAnchor } from "@/internal/billing/v2/setup/setupResetCycleAnchor.js";
import type { MigrateCustomerContext } from "@/internal/migrations/v2/operations/types/index.js";

export type MigrationOperationBillingContext = {
	fullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
	featureQuantities: FeatureOptions[];
	currentEpochMs: number;
	billingCycleAnchorMs: number | "now";
	resetCycleAnchorMs: number | "now";
	trialContext?: TrialContext;
	stripeCustomer?: Stripe.Customer;
	stripeSubscription?: StripeSubscriptionWithDiscounts;
	stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule;
	stripeDiscounts: StripeDiscountWithCoupon[];
	paymentMethod?: Stripe.PaymentMethod;
	skipExistingUsageCarry?: boolean;
};

export const setupMigrationOperationBillingContext = async ({
	ctx,
	context,
	fullCustomer,
	customerProduct,
	fullProduct,
}: {
	ctx: AutumnContext;
	context: MigrateCustomerContext;
	fullCustomer?: FullCustomer;
	customerProduct: FullCusProduct;
	fullProduct?: FullProduct;
}): Promise<MigrationOperationBillingContext> => {
	const subscriptionId = customerProduct.subscription_ids?.[0];
	const stripeSubscription = subscriptionId
		? await context.stripeCache.getStripeSubscription({ customerProduct })
		: undefined;
	const stripeCustomerContext = subscriptionId
		? await context.stripeCache.getStripeCustomer()
		: {
				stripeCustomer: undefined,
				paymentMethod: undefined,
				testClockFrozenTime: undefined,
			};
	const [stripeSubscriptionSchedule, stripeDiscounts] = subscriptionId
		? await Promise.all([
				context.stripeCache.getStripeSubscriptionSchedule({
					customerProduct,
					stripeSubscription,
				}),
				context.stripeCache.getStripeDiscounts({
					customerProduct,
					stripeSubscription,
				}),
			])
		: [undefined, []];

	const currentEpochMs =
		stripeCustomerContext.testClockFrozenTime ?? Date.now();
	const resolvedFullProduct =
		fullProduct ?? cusProductToProduct({ cusProduct: customerProduct });
	const trialContext = setupUpdateSubscriptionTrialContext({
		stripeSubscription,
		customerProduct,
		currentEpochMs,
		params: {},
		fullProduct: resolvedFullProduct,
	});

	let billingCycleAnchorMs = setupBillingCycleAnchor({
		stripeSubscription,
		customerProduct,
		newFullProduct: resolvedFullProduct,
		trialContext,
		currentEpochMs,
	});

	if (trialContext?.trialEndsAt) {
		billingCycleAnchorMs = trialContext.trialEndsAt;
	}

	const resetCycleAnchorMs = setupResetCycleAnchor({
		billingCycleAnchorMs,
		customerProduct,
		newFullProduct: resolvedFullProduct,
	});

	void ctx;

	return {
		fullCustomer: fullCustomer ?? context.fullCustomer,
		customerProduct,
		featureQuantities: [],
		currentEpochMs,
		billingCycleAnchorMs,
		resetCycleAnchorMs,
		trialContext,
		stripeCustomer: stripeCustomerContext.stripeCustomer,
		stripeSubscription,
		stripeSubscriptionSchedule,
		stripeDiscounts,
		paymentMethod: stripeCustomerContext.paymentMethod,
	};
};
