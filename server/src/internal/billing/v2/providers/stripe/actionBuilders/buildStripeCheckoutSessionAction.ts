import type {
	AutumnBillingPlan,
	BillingContext,
	StripeCheckoutSessionAction,
} from "@autumn/shared";
import { msToSeconds, orgToReturnUrl } from "@autumn/shared";
import { addMinutes } from "date-fns";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildStripeCheckoutSessionItems } from "@/internal/billing/v2/providers/stripe/utils/checkoutSessions/buildStripeCheckoutSessionItems";
import { stripeDiscountsToCheckoutParams } from "@/internal/billing/v2/providers/stripe/utils/discounts/stripeDiscountsToParams";

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
	const {
		trialContext,
		stripeCustomer,
		stripeDiscounts,
		checkoutSessionParams,
	} = billingContext;

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
		...oneOffLineItems.filter((item) => item.quantity !== 0),
	];

	// 4. Trial handling (only for subscription mode)
	const trialEnd =
		mode === "subscription" && trialContext?.trialEndsAt
			? msToSeconds(addMinutes(trialContext.trialEndsAt, 10).getTime())
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
		? stripeDiscountsToCheckoutParams({ stripeDiscounts })
		: undefined;

	// 7. Build params (only variable params - static params added in execute).
	// Tax policy is part of the action shape (org config decides), so it
	// lives here in the build step rather than being injected at execute
	// time. Same rationale as `buildStripeSubscriptionUpdateAction`: the
	// action object should be self-describing in logs / EXTRA LOGS.
	const autumnAutoTax: Partial<Stripe.Checkout.SessionCreateParams> = org
		.config.automatic_tax
		? {
				automatic_tax: { enabled: true },
				billing_address_collection: "required",
				customer_update: { address: "auto", name: "auto" },
				tax_id_collection: { enabled: true },
			}
		: {};

	const params: Stripe.Checkout.SessionCreateParams = {
		customer: stripeCustomer?.id ?? "none",
		mode,
		line_items: lineItems,
		subscription_data: subscriptionData,
		success_url: billingContext.successUrl ?? orgToReturnUrl({ org, env }),
		discounts,
		...autumnAutoTax,
	};

	return {
		type: "create",
		params,
		checkoutSessionParams:
			checkoutSessionParams as Partial<Stripe.Checkout.SessionCreateParams>,
	};
};
