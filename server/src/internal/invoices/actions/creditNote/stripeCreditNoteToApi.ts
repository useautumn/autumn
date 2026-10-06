import {
	type ApiCreditNote,
	type CreditNoteDestination,
	stripeToAtmnAmount,
} from "@autumn/shared";
import type Stripe from "stripe";

const sum = (amounts: number[]) =>
	amounts.reduce((total, amount) => total + amount, 0);

/** The split is the one we sent: the whole post-payment amount on the chosen destination. */
export const stripeCreditNoteToApi = ({
	creditNote,
	lines,
	invoiceId,
	destination,
	stripeLineIdToAutumn,
	isPreview,
}: {
	creditNote: Stripe.CreditNote;
	lines: Stripe.CreditNoteLineItem[];
	invoiceId: string;
	destination: CreditNoteDestination;
	stripeLineIdToAutumn: Map<string, string>;
	isPreview: boolean;
}): ApiCreditNote => {
	const toAtmn = (amount: number) =>
		stripeToAtmnAmount({ amount, currency: creditNote.currency });
	const postPayment = toAtmn(creditNote.post_payment_amount);
	const allocatedTo = (target: CreditNoteDestination) =>
		destination === target ? postPayment : 0;

	return {
		id: isPreview ? null : creditNote.id,
		invoice_id: invoiceId,
		number: isPreview ? null : creditNote.number,
		status: isPreview ? null : creditNote.status,
		currency: creditNote.currency,
		subtotal: toAtmn(creditNote.subtotal),
		discount_amount: toAtmn(
			sum(creditNote.discount_amounts.map((discount) => discount.amount)),
		),
		tax_amount: toAtmn(
			sum((creditNote.total_taxes ?? []).map((tax) => tax.amount)),
		),
		total: toAtmn(creditNote.total),
		pre_payment_amount: toAtmn(creditNote.pre_payment_amount),
		post_payment_amount: postPayment,
		refund_amount: allocatedTo("refund"),
		credit_amount: allocatedTo("customer_balance"),
		out_of_band_amount: allocatedTo("out_of_band"),
		reason: creditNote.reason,
		memo: creditNote.memo,
		pdf: isPreview ? null : creditNote.pdf,
		lines: lines.map((line) => ({
			invoice_line_item_id: line.invoice_line_item
				? (stripeLineIdToAutumn.get(line.invoice_line_item) ?? null)
				: null,
			description: line.description,
			quantity: line.quantity,
			amount: toAtmn(line.amount),
			discount_amount: toAtmn(
				sum(line.discount_amounts.map((discount) => discount.amount)),
			),
		})),
	};
};
