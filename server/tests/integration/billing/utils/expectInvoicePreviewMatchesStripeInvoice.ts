import { expect } from "bun:test";
import { type ApiInvoicePreviewV0, stripeToAtmnAmount } from "@autumn/shared";
import type Stripe from "stripe";

const toChargedAmounts = (amounts: number[]) =>
	amounts
		.map((amount) => Number(amount.toFixed(2)))
		.filter((amount) => amount !== 0)
		.sort((a, b) => a - b);

/** Asserts the upcoming-invoice preview billed exactly what Stripe's invoice did, line by line. */
export const expectInvoicePreviewMatchesStripeInvoice = async ({
	stripeCli,
	preview,
	stripeInvoiceId,
}: {
	stripeCli: Stripe;
	preview: ApiInvoicePreviewV0;
	stripeInvoiceId: string;
}) => {
	const stripeInvoice = await stripeCli.invoices.retrieve(stripeInvoiceId);
	const stripeLineAmounts = stripeInvoice.lines.data.map((line) =>
		stripeToAtmnAmount({ amount: line.amount, currency: line.currency }),
	);

	expect(
		toChargedAmounts(preview.line_items.map((line) => line.subtotal)),
	).toEqual(toChargedAmounts(stripeLineAmounts));
	expect(preview.total).toBeCloseTo(
		stripeToAtmnAmount({
			amount: stripeInvoice.total,
			currency: stripeInvoice.currency,
		}),
		2,
	);
};
