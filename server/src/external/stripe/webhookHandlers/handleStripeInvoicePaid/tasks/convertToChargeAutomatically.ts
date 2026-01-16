import type { StripeInvoicePaidContext } from "@/external/stripe/webhookHandlers/handleStripeInvoicePaid/setupStripeInvoicePaidContext";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { nullish } from "@/utils/genUtils";

export const convertToChargeAutomatically = async ({
	ctx,
	invoicePaidContext,
}: {
	ctx: StripeWebhookContext;
	invoicePaidContext: StripeInvoicePaidContext;
}) => {
	const { stripeCli, org } = ctx;
	const { stripeInvoice, stripeSubscriptionId } = invoicePaidContext;

	const payments = stripeInvoice.payments;
	const firstPayment = payments?.data?.[0];
	const paymentIntentId = firstPayment?.payment?.payment_intent as string;

	const orgConfigShouldConvert = org.config.convert_to_charge_automatically;

	if (
		nullish(paymentIntentId) ||
		nullish(stripeSubscriptionId) ||
		!orgConfigShouldConvert
	)
		return;

	try {
		const stripeSubscription =
			await stripeCli.subscriptions.retrieve(stripeSubscriptionId);

		if (stripeSubscription.collection_method === "charge_automatically") return;

		const paymentIntent =
			await stripeCli.paymentIntents.retrieve(paymentIntentId);

		const paymentMethod = await stripeCli.paymentMethods.retrieve(
			paymentIntent.payment_method as string,
		);

		await stripeCli.paymentMethods.attach(paymentMethod.id, {
			customer: stripeInvoice.customer as string,
		});

		await stripeCli.subscriptions.update(stripeSubscriptionId, {
			collection_method: "charge_automatically",
			default_payment_method: paymentMethod.id,
		});

		ctx.logger.info(
			`[invoice.paid] Converted subscription ${stripeSubscriptionId} to collection method: charge automatically`,
		);
	} catch (error) {
		ctx.logger.warn(
			`[invoice.paid] Convert to charge automatically failed: ${error}`,
		);
	}
};
