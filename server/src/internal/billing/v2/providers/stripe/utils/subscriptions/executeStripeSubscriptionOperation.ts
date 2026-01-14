import { InternalError } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/billingContext";
import type { StripeSubscriptionAction } from "@/internal/billing/v2/types/billingPlan";

type InvoiceModeParams = {
	collection_method?: "send_invoice";
	days_until_due?: number;
};

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

	const invoiceModeParams = billingContext.invoiceMode
		? {
				collection_method: "send_invoice" as const,
				days_until_due: 30,
			}
		: {};

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
					expand: ["latest_invoice"],
				},
			);
		}
		case "create":
			return await stripeClient.subscriptions.create({
				...subscriptionAction.params,
				...invoiceModeParams,
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
