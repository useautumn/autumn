import { expect } from "bun:test";
import {
	type ReissueInvoiceResponse,
	stripeToAtmnAmount,
} from "@autumn/shared";
import type Stripe from "stripe";

export const expectReissueTaxPreviewCorrect = ({
	response,
	total,
	issued,
	automaticTax = true,
}: {
	response: ReissueInvoiceResponse;
	total: number;
	issued?: Stripe.Invoice;
	automaticTax?: boolean;
}) => {
	expect(response.invoice).toBeNull();
	expect(response.voided_invoice_id).toBeNull();
	expect(response.credit_note_id).toBeNull();
	const { preview } = response;
	expect(preview.currency).toBe("usd");
	expect(preview.subtotal).toBe(20);
	expect(preview.total).toBe(total);
	expect(preview.amount_due).toBe(total);
	expect(preview.discount_total).toBe(0);
	expect(preview.lines).toHaveLength(1);
	expect(preview.lines[0].amount).toBe(20);
	if (total > 20) {
		expect(preview.tax).toEqual({
			total: total - 20,
			amount_inclusive: 0,
			amount_exclusive: total - 20,
			status: "complete",
		});
	} else {
		expect(preview.tax).toBeNull();
	}
	if (issued) {
		expect(issued.status).toBe("open");
		expect(issued.status_transitions.finalized_at).toBeNumber();
		expect(issued.automatic_tax.enabled).toBe(automaticTax);
		if (automaticTax) expect(issued.automatic_tax.status).toBe("complete");
		expect(issued.lines.data).toHaveLength(1);
		expect(
			stripeToAtmnAmount({ amount: issued.total, currency: issued.currency }),
		).toBe(preview.total);
		expect(
			stripeToAtmnAmount({
				amount: issued.subtotal,
				currency: issued.currency,
			}),
		).toBe(preview.subtotal);
		expect(
			stripeToAtmnAmount({
				amount:
					issued.total_taxes?.reduce((sum, tax) => sum + tax.amount, 0) ?? 0,
				currency: issued.currency,
			}),
		).toBe(preview.tax?.total ?? 0);
	}
};
