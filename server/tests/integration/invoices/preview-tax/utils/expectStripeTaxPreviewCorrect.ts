import { expect } from "bun:test";
import type Stripe from "stripe";

export const expectStripeTaxPreviewCorrect = ({
	preview,
	total,
	issued,
	automaticTax = true,
}: {
	preview: Stripe.Invoice;
	total: number;
	issued?: Stripe.Invoice;
	automaticTax?: boolean;
}) => {
	expect(preview.total).toBe(total);
	expect(preview.subtotal).toBe(2000);
	expect(preview.lines.data).toHaveLength(1);
	expect(preview.automatic_tax.enabled).toBe(automaticTax);
	if (automaticTax) expect(preview.automatic_tax.status).toBe("complete");
	if (issued) {
		expect(issued.status).toBe("open");
		expect(issued.status_transitions.finalized_at).toBeNumber();
		expect(issued.total).toBe(preview.total);
		expect(issued.automatic_tax.enabled).toBe(automaticTax);
		expect(issued.total_taxes?.map((tax) => tax.amount)).toEqual(
			preview.total_taxes?.map((tax) => tax.amount),
		);
	}
};

export const expectPreviewCustomerUnchanged = ({
	before,
	after,
	beforeTaxIds,
	afterTaxIds,
}: {
	before: Stripe.Customer | Stripe.DeletedCustomer;
	after: Stripe.Customer | Stripe.DeletedCustomer;
	beforeTaxIds: Stripe.TaxId[];
	afterTaxIds: Stripe.TaxId[];
}) => {
	if (before.deleted || after.deleted)
		throw new Error("Expected a non-deleted customer");
	expect(after.address).toEqual(before.address);
	expect(after.tax_exempt).toEqual(before.tax_exempt);
	expect(after.balance).toBe(before.balance);
	expect(afterTaxIds).toEqual(beforeTaxIds);
};
