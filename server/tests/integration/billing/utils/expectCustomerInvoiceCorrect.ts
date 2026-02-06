import { expect } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { ApiVersion } from "@autumn/shared";
import { AutumnInt } from "@/external/autumn/autumnCli";

const defaultAutumn = new AutumnInt({ version: ApiVersion.V1_2 });

/**
 * Check customer invoice count and optionally the latest invoice details.
 *
 * Note: `latestTotal` uses approximate comparison (±0.01) to handle
 * floating point precision differences in proration calculations.
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
		const actualTotal = invoices[0].total;
		const diff = Math.abs(actualTotal - latestTotal);
		const tolerance = 0.01;

		if (diff > tolerance) {
			throw new Error(
				`Invoice total mismatch: expected $${latestTotal.toFixed(2)}, got $${actualTotal.toFixed(2)} (diff: $${diff.toFixed(2)}, tolerance: ±$${tolerance})`,
			);
		}
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
