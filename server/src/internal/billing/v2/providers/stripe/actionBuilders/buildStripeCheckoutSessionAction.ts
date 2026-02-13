import type {
	AutumnBillingPlan,
	BillingContext,
	StripeCheckoutSessionAction,
} from "@autumn/shared";
import { msToSeconds, orgToReturnUrl } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildStripeCheckoutSessionItems } from "@/internal/billing/v2/providers/stripe/utils/checkoutSessions/buildStripeCheckoutSessionItems";
import { stripeDiscountsToParams } from "@/internal/billing/v2/providers/stripe/utils/discounts/stripeDiscountsToParams";

export const buildStripeCheckoutSessionAction = ({
	ctx,
	billingContext,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}): StripeCheckoutSessionAction => {
	const { org, env } = ctx;
	const { trialContext, stripeCustomer, stripeDiscounts } = billingContext;

	// 1. Get recurring and one-off items (recurring filtered to largest interval)
	const { recurringLineItems, oneOffLineItems } =
		buildStripeCheckoutSessionItems({
			ctx,
			billingContext,
			newCustomerProducts: autumnBillingPlan.insertCustomerProducts,
		});

	// 2. Determine mode: "subscription" or "payment"
	const isOneOffOnly = recurringLineItems.length === 0;
	const mode: "subscription" | "payment" = isOneOffOnly
		? "payment"
		: "subscription";

	// 3. Build line_items from recurring items and one-off items
	const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
		...recurringLineItems.filter((item) => item.quantity !== 0),
		...oneOffLineItems,
	];

	// 4. Trial handling (only for subscription mode)
	const trialEnd =
		mode === "subscription" && trialContext?.trialEndsAt
			? msToSeconds(trialContext.trialEndsAt)
			: undefined;

	// 5. Build subscription_data (only for subscription mode)
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

	// 6. Build discounts for checkout session
	const discounts = stripeDiscounts?.length
		? stripeDiscountsToParams({ stripeDiscounts })
		: undefined;

	// 7. Build params (only variable params - static params added in execute)
	const params: Stripe.Checkout.SessionCreateParams = {
		customer: stripeCustomer.id,
		mode,
		line_items: lineItems,
		subscription_data: subscriptionData,
		success_url: orgToReturnUrl({ org, env }),
		discounts,
	};

	return { type: "create", params };
};
