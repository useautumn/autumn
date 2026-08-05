import { expect } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { ApiVersion } from "@autumn/shared";
import {
	type PollableExpectParams,
	pollableCustomerExpect,
} from "@tests/utils/pollableCustomerExpect.js";
import { Decimal } from "decimal.js";
import { AutumnInt } from "@/external/autumn/autumnCli";

const defaultAutumn = new AutumnInt({ version: ApiVersion.V1_2 });

const TOTAL_TOLERANCE = 0.01;

type InvoiceExpectParams = PollableExpectParams<ApiCustomerV3> & {
	count: number;
	invoiceIndex?: number;
	latestTotal?: number;
	latestStatus?: "paid" | "draft" | "open" | "void";
	latestInvoiceProductId?: string;
	latestInvoiceProductIds?: string[];
};

/**
 * Check customer invoice count and optionally invoice details at a given index.
 *
 * Note: `latestTotal` uses approximate comparison (±0.01) to handle
 * floating point precision differences in proration calculations.
 *
 * @param invoiceIndex - Which invoice to check (0 = latest, 1 = second latest, etc.). Defaults to 0.
 */
const assertCustomerInvoiceCorrect = ({
	customer,
	count,
	invoiceIndex = 0,
	latestTotal,
	latestStatus,
	latestInvoiceProductId,
	latestInvoiceProductIds,
}: InvoiceExpectParams & { customer: ApiCustomerV3 }) => {
	const invoices = customer.invoices;

	if (invoices === undefined) {
		throw new Error("No invoices found");
	}

	expect(invoices.length).toBe(count);

	const invoice = invoices[invoiceIndex];
	if (!invoice) return;

	if (latestTotal !== undefined) {
		const actualTotal = invoice.total;
		const diff = Math.abs(
			new Decimal(actualTotal).minus(latestTotal).toDecimalPlaces(2).toNumber(),
		);

		if (diff > TOTAL_TOLERANCE) {
			throw new Error(
				`Invoice[${invoiceIndex}] total mismatch: expected $${latestTotal.toFixed(2)}, got $${actualTotal.toFixed(2)} (diff: $${diff.toFixed(2)}, tolerance: ±$${TOTAL_TOLERANCE})`,
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

/**
 * Pass `customerId` (instead of a fetched `customer`) to poll until the
 * invoices settle — Stripe-generated invoices and status flips (draft → paid)
 * arrive by webhook. See {@link pollableCustomerExpect}.
 */
export const expectCustomerInvoiceCorrect = pollableCustomerExpect({
	fetchCustomer: ({ customerId, autumn }: InvoiceExpectParams) =>
		(autumn ?? defaultAutumn).customers.get<ApiCustomerV3>(customerId!),
	assert: assertCustomerInvoiceCorrect,
});
