import { ErrCode, RecaseError } from "@autumn/shared";
import type Stripe from "stripe";

/** Per Stripe's first_time_transaction rule, any non-void invoice counts */
const BLOCKING_INVOICE_STATUSES: Stripe.Invoice.Status[] = [
	"draft",
	"open",
	"paid",
	"uncollectible",
];

/**
 * Whether the customer has no prior successful payments or non-void invoices —
 * Stripe's `restrictions.first_time_transaction` definition.
 */
export const isFirstTimeStripeCustomer = async ({
	stripeCli,
	stripeCustomerId,
}: {
	stripeCli: Stripe;
	stripeCustomerId?: string | null;
}): Promise<boolean> => {
	if (!stripeCustomerId) return true;

	const hasSuccessfulPayment = async () => {
		for await (const charge of stripeCli.charges.list({
			customer: stripeCustomerId,
			limit: 100,
		})) {
			if (charge.status === "succeeded") return true;
		}
		return false;
	};

	const hasBlockingInvoice = async () => {
		for await (const invoice of stripeCli.invoices.list({
			customer: stripeCustomerId,
			limit: 100,
		})) {
			if (invoice.status && BLOCKING_INVOICE_STATUSES.includes(invoice.status))
				return true;
		}
		return false;
	};

	const [paymentFound, invoiceFound] = await Promise.all([
		hasSuccessfulPayment(),
		hasBlockingInvoice(),
	]);

	return !(paymentFound || invoiceFound);
};

/** Throws PromoCodeFirstTimeOnly when the customer has prior transactions */
export const assertFirstTimeStripeCustomer = async ({
	stripeCli,
	stripeCustomerId,
	promoCode,
}: {
	stripeCli: Stripe;
	stripeCustomerId?: string | null;
	promoCode?: string;
}) => {
	const isFirstTime = await isFirstTimeStripeCustomer({
		stripeCli,
		stripeCustomerId,
	});

	if (isFirstTime) return;

	throw new RecaseError({
		message: promoCode
			? `Promo code "${promoCode}" is only valid for first-time purchases`
			: "This promo code is only valid for first-time purchases",
		code: ErrCode.PromoCodeFirstTimeOnly,
		statusCode: 400,
	});
};
