import { expect } from "bun:test";
import type { ApiCustomer } from "@autumn/shared";

export const expectLatestInvoiceCorrect = ({
	customer,
	productId,
	amount,
}: {
	customer: ApiCustomer;
	productId: string;
	amount: number;
}) => {
	const invoices = customer.invoices;

	expect(invoices?.[0].total).toBe(amount);
	expect(invoices?.[0].plan_ids).toContain(productId);
};
