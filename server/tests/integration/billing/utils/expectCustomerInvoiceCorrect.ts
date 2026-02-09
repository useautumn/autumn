import { expect } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { ApiVersion } from "@autumn/shared";
import { AutumnInt } from "@/external/autumn/autumnCli";

const defaultAutumn = new AutumnInt({ version: ApiVersion.V1_2 });

/**
 * Check customer invoice count and optionally invoice details at a given index.
 *
 * Note: `latestTotal` uses approximate comparison (±0.01) to handle
 * floating point precision differences in proration calculations.
 *
 * @param invoiceIndex - Which invoice to check (0 = latest, 1 = second latest, etc.). Defaults to 0.
 */
export const expectCustomerInvoiceCorrect = async ({
	customerId,
	customer: providedCustomer,
	count,
	invoiceIndex = 0,
	latestTotal,
	latestStatus,
	latestInvoiceProductId,
	latestInvoiceProductIds,
}: {
	customerId?: string;
	customer?: ApiCustomerV3;
	count: number;
	invoiceIndex?: number;
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

	const invoice = invoices[invoiceIndex];
	if (!invoice) return;

	if (latestTotal !== undefined) {
		const actualTotal = invoice.total;
		const diff = Math.abs(actualTotal - latestTotal);
		const tolerance = 0.01;

		if (diff > tolerance) {
			throw new Error(
				`Invoice[${invoiceIndex}] total mismatch: expected $${latestTotal.toFixed(2)}, got $${actualTotal.toFixed(2)} (diff: $${diff.toFixed(2)}, tolerance: ±$${tolerance})`,
			);
		}
	}

	if (latestStatus !== undefined) {
		expect(invoice.status).toBe(latestStatus);
	}

	if (latestInvoiceProductId !== undefined) {
		expect(invoice.product_ids).toContain(latestInvoiceProductId);
	}

	if (latestInvoiceProductIds !== undefined) {
		for (const productId of latestInvoiceProductIds) {
			expect(invoice.product_ids).toContain(productId);
		}
	}
};
