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
import { buildAutumnSubscriptionMetadata } from "@/internal/billing/v2/providers/stripe/utils/common/autumnStripeMetadata";
import { stripeDiscountsToCheckoutParams } from "@/internal/billing/v2/providers/stripe/utils/discounts/stripeDiscountsToParams";
import { buildStripeNewSubscriptionAnchorParams } from "@/internal/billing/v2/providers/stripe/utils/subscriptions/buildStripeNewSubscriptionAnchorParams";

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

	const { recurringLineItems, oneOffLineItems } =
		buildStripeCheckoutSessionItems({
			ctx,
			billingContext,
			newCustomerProducts: autumnBillingPlan.insertCustomerProducts,
		});

	const isOneOffOnly = recurringLineItems.length === 0;
	const mode: "subscription" | "payment" = isOneOffOnly
		? "payment"
		: "subscription";

	const taxRateId = billingContext.taxRateId;
	const applyTaxRateToLineItem = (
		item: Stripe.Checkout.SessionCreateParams.LineItem,
	): Stripe.Checkout.SessionCreateParams.LineItem =>
		taxRateId ? { ...item, tax_rates: [taxRateId] } : item;

	const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
		...recurringLineItems.filter((item) => item.quantity !== 0),
		...oneOffLineItems
			.filter((item) => item.quantity !== 0)
			.map(applyTaxRateToLineItem),
	];

	const carriedTaxRates =
		mode === "subscription" && !taxRateId
			? billingContext.carriedSubscriptionParams?.default_tax_rates
			: undefined;

	const trialEnd =
		mode === "subscription" && trialContext?.trialEndsAt
			? msToSeconds(addMinutes(trialContext.trialEndsAt, 10).getTime())
			: undefined;

	const subscriptionData:
		| Stripe.Checkout.SessionCreateParams.SubscriptionData
		| undefined =
		mode === "subscription"
			? {
					trial_end: trialEnd,
					...buildStripeNewSubscriptionAnchorParams({ billingContext }),
					...(trialContext?.cardRequired && {
						trial_settings: {
							end_behavior: { missing_payment_method: "cancel" },
						},
					}),
					...(taxRateId && { default_tax_rates: [taxRateId] }),
					...(carriedTaxRates && { default_tax_rates: carriedTaxRates }),
					metadata: buildAutumnSubscriptionMetadata({
						actionSource: billingContext.actionSource,
					}),
				}
			: undefined;

	const discounts = stripeDiscounts?.length
		? stripeDiscountsToCheckoutParams({ stripeDiscounts })
		: undefined;

	const autumnAutoTax: Partial<Stripe.Checkout.SessionCreateParams> =
		// Stripe rejects automatic_tax alongside default_tax_rates; carried manual rates take precedence.
		org.config.automatic_tax &&
		billingContext.automaticTaxEnabled !== false &&
		!carriedTaxRates?.length
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
