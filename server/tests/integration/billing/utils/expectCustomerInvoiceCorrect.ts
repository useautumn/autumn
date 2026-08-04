import { expect } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { ApiVersion } from "@autumn/shared";
import { pollUntil } from "@tests/utils/genUtils.js";
import { Decimal } from "decimal.js";
import { AutumnInt } from "@/external/autumn/autumnCli";

const defaultAutumn = new AutumnInt({ version: ApiVersion.V1_2 });

const TOTAL_TOLERANCE = 0.01;
/** Autumn-billed invoices are written during the request, but Stripe-generated
 * ones (renewals, trial $0) and status flips (draft → paid) come via webhook. */
const DEFAULT_SETTLE_TIMEOUT_MS = 30_000;

const totalsMatch = ({
	actual,
	expected,
}: {
	actual: number;
	expected: number;
}) =>
	Math.abs(new Decimal(actual).minus(expected).toDecimalPlaces(2).toNumber()) <=
	TOTAL_TOLERANCE;

/**
 * Check customer invoice count and optionally invoice details at a given index.
 *
 * Note: `latestTotal` uses approximate comparison (±0.01) to handle
 * floating point precision differences in proration calculations.
 *
 * Pass `customerId` (instead of a pre-fetched `customer`) to poll until the
 * webhook-driven invoices settle — assertions then run against the final state.
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
	settleTimeoutMs = DEFAULT_SETTLE_TIMEOUT_MS,
}: {
	customerId?: string;
	customer?: ApiCustomerV3;
	count: number;
	invoiceIndex?: number;
	latestTotal?: number;
	latestStatus?: "paid" | "draft" | "open" | "void";
	latestInvoiceProductId?: string;
	latestInvoiceProductIds?: string[];
	settleTimeoutMs?: number;
}) => {
	/** Every expectation below, as a predicate — so polling stops the moment the
	 * state the test asserts on is reached. */
	const hasSettled = (candidate: ApiCustomerV3) => {
		const invoices = candidate.invoices;
		if (invoices === undefined || invoices.length !== count) return false;

		const invoice = invoices[invoiceIndex];
		if (!invoice) return true;

		if (
			latestTotal !== undefined &&
			!totalsMatch({ actual: invoice.total, expected: latestTotal })
		) {
			return false;
		}
		if (latestStatus !== undefined && invoice.status !== latestStatus) {
			return false;
		}

		const expectedProductIds = [
			...(latestInvoiceProductId ? [latestInvoiceProductId] : []),
			...(latestInvoiceProductIds ?? []),
		];
		return expectedProductIds.every((productId) =>
			invoice.product_ids?.includes(productId),
		);
	};

	const customer = providedCustomer
		? providedCustomer
		: await pollUntil({
				fetch: () => defaultAutumn.customers.get<ApiCustomerV3>(customerId!),
				until: hasSettled,
				timeoutMs: settleTimeoutMs,
				intervalMs: 1000,
			});

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
