import type { AutumnBillingPlan, BillingContext } from "@autumn/shared";
import { msToSeconds } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { isBackdateRecreate } from "@/internal/billing/v2/actions/setPlans/utils/isBackdateRecreate";
import { stripeDiscountsToParams } from "@/internal/billing/v2/providers/stripe/utils/discounts/stripeDiscountsToParams";
import { isNewSubscriptionBackdate } from "@/internal/billing/v2/utils/backdate/isNewSubscriptionBackdate";
import { buildStripeNewSubscriptionAnchorParams } from "./buildStripeNewSubscriptionAnchorParams";
import { willStripeSubscriptionInvoiceEndOfCycle } from "./willStripeSubscriptionInvoiceEndOfCycle";

export const buildStripeSubscriptionCreateAction = ({
	ctx,
	billingContext,
	subItemsUpdate,
	addInvoiceItems,
	subscriptionCancelAt,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	subItemsUpdate: Stripe.SubscriptionUpdateParams.Item[];
	addInvoiceItems: Stripe.SubscriptionCreateParams.AddInvoiceItem[];
	subscriptionCancelAt?: number;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const { stripeCustomer, paymentMethod, trialContext, stripeDiscounts } =
		billingContext;

	const trialEndsAt = trialContext?.trialEndsAt;

	const sendsInvoice =
		!!billingContext.invoiceMode ||
		billingContext.carriedSubscriptionParams?.collection_method ===
			"send_invoice";
	// Stripe rejects trial_settings.missing_payment_method together with send_invoice.
	const freeTrialNoCardRequired =
		trialContext?.cardRequired === false && !sendsInvoice;
	const isCustomPaymentMethod = paymentMethod?.type === "custom";

	const skipsBackdatedCycles =
		billingContext.requestedProrationBehavior === "none" &&
		isNewSubscriptionBackdate({ billingContext });

	const willCreateInvoiceEndOfCycle = willStripeSubscriptionInvoiceEndOfCycle({
		ctx,
		billingContext,
		autumnBillingPlan,
	});

	const stripeSubscriptionCreateParams: Stripe.SubscriptionCreateParams = {
		customer: stripeCustomer?.id ?? "none",
		items: subItemsUpdate.map((item) => ({
			...(item.price_data
				? { price_data: item.price_data }
				: { price: item.price }),
			quantity: item.quantity,
			...(item.metadata && { metadata: item.metadata }),
		})),

		billing_mode: { type: "flexible" },

		backdate_start_date: billingContext.subscriptionBackdateStartMs
			? msToSeconds(billingContext.subscriptionBackdateStartMs)
			: undefined,

		collection_method: "charge_automatically",

		...billingContext.carriedSubscriptionParams,

		payment_behavior:
			billingContext.paymentBehaviorIntent ??
			(!paymentMethod || isCustomPaymentMethod
				? "default_incomplete"
				: "allow_incomplete"),

		add_invoice_items:
			willCreateInvoiceEndOfCycle || isBackdateRecreate({ billingContext })
				? undefined
				: addInvoiceItems,

		trial_end: trialEndsAt ? msToSeconds(trialEndsAt) : undefined,

		...(skipsBackdatedCycles && { proration_behavior: "none" }),

		...buildStripeNewSubscriptionAnchorParams({ billingContext }),

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
