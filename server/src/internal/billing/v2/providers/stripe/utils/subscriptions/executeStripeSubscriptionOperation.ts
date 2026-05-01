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

	// default_incomplete surfaces payment/3DS errors clearly.
	const createPaymentBehavior =
		nullish(paymentMethod) || paymentMethod?.type === "custom"
			? "default_incomplete"
			: "allow_incomplete";

	// Pass resolved PM explicitly when customer has no default PM set.
	const customerHasDefaultPm =
		billingContext.stripeCustomer?.invoice_settings?.default_payment_method;

	const fallbackPaymentMethodParams =
		paymentMethod && !customerHasDefaultPm
			? { default_payment_method: paymentMethod.id }
			: {};

	const userMeta = mergeStripeMetadata({
		userMetadata: billingContext.userMetadata,
	});

	// Skip auto_tax in invoice mode: send_invoice has no address-collection
	// UI so Stripe Tax rejects.
	const wantsAutoTax =
		!!ctx.org.config.automatic_tax && !billingContext.invoiceMode;

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
			const shouldResetBillingCycleAnchorNow =
				billingContext.requestedBillingCycleAnchor === "now";

			if (shouldResetBillingCycleAnchorNow) {
				stripeSubscription = await stripeClient.subscriptions.update(
					subscriptionAction.stripeSubscriptionId,
					{
						...(subscriptionHasDefaultPm
							? {}
							: fallbackPaymentMethodParams),
						...(wantsAutoTax ? { automatic_tax: { enabled: true } } : {}),
						billing_cycle_anchor: "now",
						proration_behavior: "none",
						payment_behavior: "error_if_incomplete",
						expand: ["latest_invoice"],
					},
				);
			}

			// Strip `automatic_tax` from the action params so we can re-apply
			// it here conditioned on `wantsAutoTax` (invoice-mode skip).
			const { automatic_tax: _builtAutoTax, ...paramsWithoutAutoTax } =
				subscriptionAction.params;

			return await stripeClient.subscriptions.update(
				subscriptionAction.stripeSubscriptionId,
				{
					...paramsWithoutAutoTax,
					...(subscriptionHasDefaultPm
						? {}
						: fallbackPaymentMethodParams),
					...(updateWillCreateInvoice ? invoiceModeParams : {}),
					...(userMeta && { metadata: userMeta }),
					...(wantsAutoTax ? { automatic_tax: { enabled: true } } : {}),
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
				...(wantsAutoTax ? { automatic_tax: { enabled: true } } : {}),

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
