import { expect } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { ApiVersion } from "@autumn/shared";
import { AutumnInt } from "@/external/autumn/autumnCli";

const defaultAutumn = new AutumnInt({ version: ApiVersion.V1_2 });

/**
 * Check customer invoice count and optionally the latest invoice details
 */
export const expectCustomerInvoiceCorrect = async ({
	customerId,
	customer: providedCustomer,
	count,
	latestTotal,
	latestStatus,
	latestInvoiceProductId,
	latestInvoiceProductIds,
}: {
	customerId?: string;
	customer?: ApiCustomerV3;
	count: number;
	latestTotal?: number;
	latestStatus?: "paid" | "draft" | "open" | "void";
	latestInvoiceProductId?: string;
	latestInvoiceProductIds?: string[];
}) => {
	const customer = providedCustomer
		? providedCustomer
		: await defaultAutumn.customers.get(customerId!);

	const invoices = customer.invoices;

	if (invoices === undefined) {
		throw new Error("No invoices found");
	}

	expect(invoices.length).toBe(count);

	if (latestTotal !== undefined && invoices.length > 0) {
		expect(invoices[0].total).toBe(latestTotal);
	}

	if (latestStatus !== undefined && invoices.length > 0) {
		expect(invoices[0].status).toBe(latestStatus);
	}

	if (latestInvoiceProductId !== undefined && invoices.length > 0) {
		expect(invoices[0].product_ids).toContain(latestInvoiceProductId);
	}

	if (latestInvoiceProductIds !== undefined && invoices.length > 0) {
		for (const productId of latestInvoiceProductIds) {
			expect(invoices[0].product_ids).toContain(productId);
		}
	}
};
