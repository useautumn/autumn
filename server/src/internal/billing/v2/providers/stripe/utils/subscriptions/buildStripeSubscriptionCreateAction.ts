import { msToSeconds } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import type { FreeTrialPlan } from "@/internal/billing/v2/types/billingPlan";

export const buildStripeSubscriptionCreateAction = ({
	ctx,
	billingContext,
	freeTrialPlan,
	subItemsUpdate,
	addInvoiceItems,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	freeTrialPlan?: FreeTrialPlan;
	subItemsUpdate: Stripe.SubscriptionUpdateParams.Item[];
	addInvoiceItems: Stripe.SubscriptionCreateParams.AddInvoiceItem[];
}) => {
	const { stripeCustomer, paymentMethod } = billingContext;

	const trialEndsAt = freeTrialPlan?.trialEndsAt;
	const freeTrial = freeTrialPlan?.freeTrial;

	const isFreeTrialWithCardRequired = Boolean(freeTrial?.card_required);
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

// ...paymentMethodData,
// 			customer: customer.processor.id,
// 			items: sanitizeSubItems(subItems),

// 			billing_mode: { type: "flexible" },
// 			// For custom payment methods (e.g., Vercel), start subscription as incomplete
// 			// The subscription will become active after external payment is confirmed via Payment Records API
// 			payment_behavior: isCustomPaymentMethod
// 				? "default_incomplete"
// 				: "error_if_incomplete",
// 			add_invoice_items: invoiceItems,
// 			collection_method: invoiceOnly ? "send_invoice" : "charge_automatically",
// 			days_until_due: invoiceOnly ? 30 : undefined,
// 			billing_cycle_anchor: billingCycleAnchorUnix
// 				? Math.floor(billingCycleAnchorUnix / 1000)
// 				: undefined,

// 			discounts,
// 			expand: ["latest_invoice"],

// 			// Pass metadata from attachParams (e.g., Vercel installation/billing plan IDs)
// 			metadata: metadata || undefined,

// 			// For custom payment methods, save the payment method on the subscription
// 			// so it's available in webhook handlers and for future renewals
// 			...(isCustomPaymentMethod && {
// 				payment_settings: {
// 					save_default_payment_method: "on_subscription",
// 				},
// 			}),

// 			...{
// 				trial_settings:
// 					freeTrial && !freeTrial.card_required
// 						? {
// 								end_behavior: {
// 									missing_payment_method: "cancel",
// 								},
// 							}
// 						: undefined,

// 				trial_end: freeTrialToStripeTimestamp({ freeTrial, now }),
// 			},
