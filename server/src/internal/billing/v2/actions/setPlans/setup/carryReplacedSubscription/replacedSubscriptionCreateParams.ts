import type { BillingContext } from "@autumn/shared";
import type Stripe from "stripe";
import { stripeRefToId } from "@/external/stripe/common/utils/stripeRefToId";

const AUTUMN_METADATA_PREFIX = "autumn_";

type CarriedSubscriptionParams = NonNullable<
	BillingContext["carriedSubscriptionParams"]
>;

/** The payment, collection and tax settings the replaced subscription was created with. */
export const replacedSubscriptionCreateParams = ({
	replacedStripeSubscription,
}: {
	replacedStripeSubscription: Stripe.Subscription;
}): CarriedSubscriptionParams => {
	const {
		default_payment_method: defaultPaymentMethod,
		default_source: defaultSource,
		collection_method: collectionMethod,
		days_until_due: daysUntilDue,
		default_tax_rates: defaultTaxRates,
		automatic_tax: automaticTax,
	} = replacedStripeSubscription;

	const paymentMethodId = stripeRefToId(defaultPaymentMethod);
	const sourceId = stripeRefToId(defaultSource);
	return {
		...(paymentMethodId && { default_payment_method: paymentMethodId }),
		...(sourceId && { default_source: sourceId }),
		collection_method: collectionMethod,
		...(collectionMethod === "send_invoice" && {
			days_until_due: daysUntilDue ?? undefined,
		}),
		...(defaultTaxRates?.length && {
			default_tax_rates: defaultTaxRates.map(({ id }) => id),
		}),
		...(automaticTax?.enabled && { automatic_tax: { enabled: true } }),
	};
};

/** The replaced subscription's own metadata; Autumn writes its `autumn_` keys afresh. */
export const replacedSubscriptionUserMetadata = ({
	replacedStripeSubscription,
}: {
	replacedStripeSubscription: Stripe.Subscription;
}): Record<string, string> =>
	Object.fromEntries(
		Object.entries(replacedStripeSubscription.metadata ?? {}).filter(
			([key]) => !key.startsWith(AUTUMN_METADATA_PREFIX),
		),
	);
