import type { BillingContext, StripeSubscriptionAction } from "@autumn/shared";
import { InternalError, nullish } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

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

	// default incomplete used so that payment failure / 3ds errors are clearly handled
	const createPaymentBehavior =
		nullish(paymentMethod) || paymentMethod?.type === "custom"
			? "default_incomplete"
			: "allow_incomplete";

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

			return await stripeClient.subscriptions.update(
				subscriptionAction.stripeSubscriptionId,
				{
					...subscriptionAction.params,
					...invoiceModeParams,
					payment_behavior: "error_if_incomplete",
					expand: ["latest_invoice"],
				},
			);
		}
		case "create":
			return await stripeClient.subscriptions.create({
				...subscriptionAction.params,
				...invoiceModeParams,

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
