import { msToSeconds } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";

export const buildStripeSubscriptionCreateAction = ({
	ctx,
	billingContext,
	subItemsUpdate,
	addInvoiceItems,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	subItemsUpdate: Stripe.SubscriptionUpdateParams.Item[];
	addInvoiceItems: Stripe.SubscriptionCreateParams.AddInvoiceItem[];
}) => {
	const { stripeCustomer, paymentMethod, trialContext } = billingContext;

	const trialEndsAt = trialContext?.trialEndsAt;

	const isFreeTrialWithCardRequired = trialContext?.cardRequired;
	const isCustomPaymentMethod = paymentMethod?.type === "custom";

	const stripeSubscriptionCreateParams: Stripe.SubscriptionCreateParams = {
		customer: stripeCustomer.id,
		items: subItemsUpdate.map((item) => ({
			price: item.price,
			quantity: item.quantity,
		})),

		billing_mode: { type: "flexible" },

		collection_method: "charge_automatically",

		payment_behavior: isCustomPaymentMethod
			? "default_incomplete"
			: "error_if_incomplete",

		add_invoice_items: addInvoiceItems,

		trial_end: trialEndsAt ? msToSeconds(trialEndsAt) : undefined,

		...(isFreeTrialWithCardRequired && {
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
