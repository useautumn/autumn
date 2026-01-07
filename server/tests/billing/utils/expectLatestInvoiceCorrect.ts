import { expect } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";

export const expectLatestInvoiceCorrect = ({
	customer,
	productId,
	amount,
}: {
	customer: ApiCustomerV3;
	productId: string;
	amount: number;
}) => {
	const invoices = customer.invoices;

	expect(invoices?.[0].total).toBe(amount);
	expect(invoices?.[0].product_ids).toContain(productId);
};
