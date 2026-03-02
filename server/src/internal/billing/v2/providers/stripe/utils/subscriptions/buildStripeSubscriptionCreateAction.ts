import type { BillingContext } from "@autumn/shared";
import { msToSeconds } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { stripeDiscountsToParams } from "@/internal/billing/v2/providers/stripe/utils/discounts/stripeDiscountsToParams";

export const buildStripeSubscriptionCreateAction = ({
	ctx,
	billingContext,
	subItemsUpdate,
	addInvoiceItems,
	subscriptionCancelAt,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	subItemsUpdate: Stripe.SubscriptionUpdateParams.Item[];
	addInvoiceItems: Stripe.SubscriptionCreateParams.AddInvoiceItem[];
	subscriptionCancelAt?: number;
}) => {
	const { stripeCustomer, paymentMethod, trialContext, stripeDiscounts } =
		billingContext;

	const trialEndsAt = trialContext?.trialEndsAt;

	const freeTrialNoCardRequired = trialContext?.cardRequired === false;
	const isCustomPaymentMethod = paymentMethod?.type === "custom";

	const stripeSubscriptionCreateParams: Stripe.SubscriptionCreateParams = {
		customer: stripeCustomer.id,
		items: subItemsUpdate.map((item) => ({
			...(item.price_data
				? { price_data: item.price_data }
				: { price: item.price }),
			quantity: item.quantity,
			...(item.metadata && { metadata: item.metadata }),
		})),

		billing_mode: { type: "flexible" },

		collection_method: "charge_automatically",

		payment_behavior: isCustomPaymentMethod
			? "default_incomplete"
			: "error_if_incomplete",

		add_invoice_items: addInvoiceItems,

		trial_end: trialEndsAt ? msToSeconds(trialEndsAt) : undefined,

		cancel_at: subscriptionCancelAt,

		...(stripeDiscounts?.length && {
			discounts: stripeDiscountsToParams({ stripeDiscounts }),
		}),

		...(freeTrialNoCardRequired && {
			trial_settings: {
				end_behavior: {
					missing_payment_method: "cancel",
				},
			},
		}),

		...(isCustomPaymentMethod && {
			payment_settings: {
				save_default_payment_method: "on_subscription",
			},
		}),
	};

	return {
		type: "create" as const,
		params: stripeSubscriptionCreateParams,
	};
};
