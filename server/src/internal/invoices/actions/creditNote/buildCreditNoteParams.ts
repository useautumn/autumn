import {
	atmnToStripeAmount,
	type DbInvoiceLineItem,
	ErrCode,
	type IssueCreditNoteParams,
	RecaseError,
} from "@autumn/shared";
import type Stripe from "stripe";

const invalidRequest = (message: string) =>
	new RecaseError({ message, code: ErrCode.InvalidRequest, statusCode: 400 });

/** Validates amount/lines and maps Autumn line ids onto the Stripe lines they mirror. */
export const buildCreditNoteParams = ({
	params,
	invoiceId,
	stripeInvoice,
	lineItems,
}: {
	params: IssueCreditNoteParams;
	invoiceId: string;
	stripeInvoice: Stripe.Invoice;
	lineItems: DbInvoiceLineItem[];
}): Stripe.CreditNoteCreateParams => {
	const { amount, lines, reason, memo, send_email } = params;
	if ((amount === undefined) === (lines === undefined)) {
		throw invalidRequest("Pass exactly one of amount or lines");
	}

	const currency = stripeInvoice.currency;
	const base: Stripe.CreditNoteCreateParams = {
		invoice: stripeInvoice.id,
		reason,
		memo,
		email_type: send_email === false ? "none" : "credit_note",
	};

	if (amount !== undefined) {
		return { ...base, amount: atmnToStripeAmount({ amount, currency }) };
	}

	const stripeLineIds = new Map(
		lineItems
			.filter((line) => line.stripe_id)
			.map((line) => [line.id, line.stripe_id as string]),
	);
	if (stripeLineIds.size === 0) {
		throw invalidRequest(
			`Line items aren't available for invoice ${invoiceId}; credit it with amount instead`,
		);
	}

	const seen = new Set<string>();
	const stripeLines = (lines ?? []).map((line) => {
		if (seen.has(line.id)) {
			throw invalidRequest(
				`Invoice line item ${line.id} appears more than once`,
			);
		}
		seen.add(line.id);

		if ((line.amount === undefined) === (line.quantity === undefined)) {
			throw invalidRequest(
				`Pass exactly one of amount or quantity for line ${line.id}`,
			);
		}

		const stripeLineId = stripeLineIds.get(line.id);
		if (!stripeLineId) {
			throw invalidRequest(
				`Invoice line item ${line.id} is not on this invoice`,
			);
		}

		return {
			type: "invoice_line_item" as const,
			invoice_line_item: stripeLineId,
			...(line.amount !== undefined
				? { amount: atmnToStripeAmount({ amount: line.amount, currency }) }
				: { quantity: line.quantity }),
		};
	});

	return { ...base, lines: stripeLines };
};
