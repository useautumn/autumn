import type {
	AutumnBillingPlan,
	BillingContext,
	StripeCheckoutSessionAction,
} from "@autumn/shared";
import {
	type FullCusProduct,
	msToSeconds,
	orgToReturnUrl,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingPlanToOneOffStripeItemSpecs } from "@/internal/billing/v2/providers/stripe/utils/stripeItemSpec/billingPlanToOneOffStripeItemSpecs";
import { buildStripeSubscriptionItemsUpdate } from "@/internal/billing/v2/providers/stripe/utils/subscriptionItems/buildStripeSubscriptionItemsUpdate";

export const buildStripeCheckoutSessionAction = ({
	ctx,
	billingContext,
	finalCustomerProducts,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	finalCustomerProducts: FullCusProduct[];
	autumnBillingPlan: AutumnBillingPlan;
}): StripeCheckoutSessionAction => {
	const { org, env } = ctx;
	const { trialContext, stripeCustomer } = billingContext;

	// 1. Get subscription items filtered to largest interval (for Stripe Checkout)
	const subItemsUpdate = buildStripeSubscriptionItemsUpdate({
		ctx,
		billingContext,
		finalCustomerProducts,
		filterByLargestInterval: true,
	});

	// 2. Get one-off items
	const oneOffItemSpecs = billingPlanToOneOffStripeItemSpecs({
		ctx,
		autumnBillingPlan,
	});

	// 3. Determine mode: "subscription" or "payment"
	const isOneOffOnly = subItemsUpdate.length === 0;
	const mode: "subscription" | "payment" = isOneOffOnly
		? "payment"
		: "subscription";

	// 4. Build line_items from sub items and one-off items
	const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
		...subItemsUpdate
			.filter((item) => item.price && !item.deleted)
			.filter((item) => item.quantity !== 0)
			.map((item) => ({
				price: item.price!,
				quantity: item.quantity,
			})),
		...oneOffItemSpecs.map((item) => ({
			price: item.stripePriceId,
			quantity: item.quantity ?? 1,
		})),
	];

	// 5. Trial handling (only for subscription mode)
	const trialEnd =
		mode === "subscription" && trialContext?.trialEndsAt
			? msToSeconds(trialContext.trialEndsAt)
			: undefined;

	// 6. Build subscription_data (only for subscription mode)
	const subscriptionData:
		| Stripe.Checkout.SessionCreateParams.SubscriptionData
		| undefined =
		mode === "subscription"
			? {
					trial_end: trialEnd,
					...(trialContext?.cardRequired && {
						trial_settings: {
							end_behavior: { missing_payment_method: "cancel" },
						},
					}),
				}
			: undefined;

	// 7. Build params (only variable params - static params added in execute)
	const params: Stripe.Checkout.SessionCreateParams = {
		customer: stripeCustomer.id,
		mode,
		line_items: lineItems,
		subscription_data: subscriptionData,
		success_url: orgToReturnUrl({ org, env }),
	};

	return { type: "create", params };
};
