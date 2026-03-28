import type { BillingContext, StripeSubscriptionAction } from "@autumn/shared";
import { InternalError, nullish } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { mergeStripeMetadata } from "@/internal/billing/v2/providers/stripe/utils/common/mergeStripeMetadata";
import { willStripeSubscriptionUpdateCreateInvoice } from "./willStripeSubscriptionUpdateCreateInvoice";

export const executeStripeSubscriptionOperation = async ({
	ctx,
	billingContext,
	subscriptionAction,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	subscriptionAction: StripeSubscriptionAction;
}) => {
	const { org, env } = ctx;
	const stripeClient = createStripeCli({ org, env });
	const { paymentMethod } = billingContext;

	const invoiceModeParams = billingContext.invoiceMode
		? {
				collection_method: "send_invoice" as const,
				days_until_due: 30,
			}
		: {};

	const updateWillCreateInvoice = willStripeSubscriptionUpdateCreateInvoice({
		billingContext,
		stripeSubscriptionAction: subscriptionAction,
	});

	// default incomplete used so that payment failure / 3ds errors are clearly handled
	const createPaymentBehavior =
		nullish(paymentMethod) || paymentMethod?.type === "custom"
			? "default_incomplete"
			: "allow_incomplete";

	// If customer's invoice_settings.default_payment_method is null but we
	// resolved a payment method from the customer's attached PMs, pass it
	// explicitly so Stripe knows which PM to charge.
	const customerHasDefaultPm =
		billingContext.stripeCustomer?.invoice_settings?.default_payment_method;

	const fallbackPaymentMethodParams =
		paymentMethod && !customerHasDefaultPm
			? { default_payment_method: paymentMethod.id }
			: {};

	const userMeta = mergeStripeMetadata({
		userMetadata: billingContext.userMetadata,
	});

	switch (subscriptionAction.type) {
		case "update": {
			let stripeSubscription = billingContext.stripeSubscription;

			if (
				stripeSubscription &&
				stripeSubscription.billing_mode.type !== "flexible"
			) {
				stripeSubscription = await stripeClient.subscriptions.migrate(
					stripeSubscription?.id,
					{
						billing_mode: { type: "flexible" },
					},
				);
			}

			const subscriptionHasDefaultPm =
				stripeSubscription?.default_payment_method;

			return await stripeClient.subscriptions.update(
				subscriptionAction.stripeSubscriptionId,
				{
					...subscriptionAction.params,
					...(subscriptionHasDefaultPm ? {} : fallbackPaymentMethodParams),
					...(updateWillCreateInvoice ? invoiceModeParams : {}),
					...(userMeta && { metadata: userMeta }),
					payment_behavior: "error_if_incomplete",
					expand: ["latest_invoice"],
				},
			);
		}
		case "create":
			return await stripeClient.subscriptions.create({
				...subscriptionAction.params,
				...invoiceModeParams,
				...fallbackPaymentMethodParams,
				...(userMeta && { metadata: userMeta }),

				billing_mode: { type: "flexible" },

				payment_behavior: createPaymentBehavior,

				expand: ["latest_invoice"],
			});
		case "cancel":
			return await stripeClient.subscriptions.cancel(
				subscriptionAction.stripeSubscriptionId,
				{
					expand: ["latest_invoice"],
				},
			);

		default:
			throw new InternalError({
				message: "Invalid subscription action type",
			});
	}
};
