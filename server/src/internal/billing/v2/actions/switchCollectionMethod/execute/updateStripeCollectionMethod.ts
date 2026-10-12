import { CollectionMethod } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { DEFAULT_INVOICE_MODE_NET_TERMS_DAYS } from "@/internal/billing/v2/utils/invoiceMode/invoiceModeDefaults";
import type { SwitchCollectionMethodContext } from "../setup/setupSwitchCollectionMethodContext";

const buildSendInvoiceParams = ({
	switchContext,
	stripeSubscription,
}: {
	switchContext: SwitchCollectionMethodContext;
	stripeSubscription: Stripe.Subscription;
}): Stripe.SubscriptionUpdateParams => {
	const { invoiceMode } = switchContext;
	// Stripe rejects send_invoice on a trial set to cancel when no card is collected.
	const trialCancelsWithoutCard =
		stripeSubscription.trial_settings?.end_behavior?.missing_payment_method ===
		"cancel";

	return {
		collection_method: "send_invoice",
		days_until_due:
			invoiceMode?.daysUntilDue ?? DEFAULT_INVOICE_MODE_NET_TERMS_DAYS,
		...(invoiceMode?.paymentMethodTypes?.length && {
			payment_settings: {
				payment_method_types: invoiceMode.paymentMethodTypes,
			},
		}),
		...(trialCancelsWithoutCard && {
			trial_settings: {
				end_behavior: { missing_payment_method: "create_invoice" },
			},
		}),
	};
};

const buildChargeAutomaticallyParams = ({
	switchContext,
	stripeSubscription,
}: {
	switchContext: SwitchCollectionMethodContext;
	stripeSubscription: Stripe.Subscription;
}): Stripe.SubscriptionUpdateParams => {
	const { stripeCustomer, paymentMethod } = switchContext;
	const hasDefaultPaymentMethod = Boolean(
		stripeSubscription.default_payment_method ??
			stripeCustomer?.invoice_settings?.default_payment_method,
	);

	return {
		collection_method: "charge_automatically",
		// Invoice-only types (e.g. customer_balance) are rejected on charge_automatically.
		payment_settings: { payment_method_types: "" },
		...(!hasDefaultPaymentMethod &&
			paymentMethod && { default_payment_method: paymentMethod.id }),
	};
};

export const updateStripeCollectionMethod = async ({
	ctx,
	switchContext,
}: {
	ctx: AutumnContext;
	switchContext: SwitchCollectionMethodContext;
}) => {
	const { stripeSubscription, targetCollectionMethod } = switchContext;
	if (!stripeSubscription) return;

	const params =
		targetCollectionMethod === CollectionMethod.SendInvoice
			? buildSendInvoiceParams({ switchContext, stripeSubscription })
			: buildChargeAutomaticallyParams({ switchContext, stripeSubscription });

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	await stripeCli.subscriptions.update(stripeSubscription.id, params);
};
