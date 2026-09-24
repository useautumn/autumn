import { describe, expect, test } from "bun:test";
import type Stripe from "stripe";
import { computeInvoiceTaxPreview } from "@/internal/invoices/actions/create/compute/computeInvoiceTaxPreview";

const taxRate = ({
	percentage,
	inclusive,
}: {
	percentage: number;
	inclusive: boolean;
}) => ({ id: "txr_test", percentage, inclusive }) as Stripe.TaxRate;

describe("computeInvoiceTaxPreview", () => {
	test("no tax rate yields no preview", () => {
		expect(
			computeInvoiceTaxPreview({ taxableAmounts: [100], currency: "usd" }),
		).toBeUndefined();
	});

	test("an exclusive rate adds tax on top", () => {
		const preview = computeInvoiceTaxPreview({
			taxableAmounts: [100],
			currency: "usd",
			taxRate: taxRate({ percentage: 20, inclusive: false }),
		});
		expect(preview?.total).toBe(20);
		expect(preview?.amount_exclusive).toBe(20);
		expect(preview?.amount_inclusive).toBe(0);
		expect(preview?.status).toBe("complete");
	});

	test("an inclusive rate reports the tax already inside the amount", () => {
		const preview = computeInvoiceTaxPreview({
			taxableAmounts: [100],
			currency: "usd",
			taxRate: taxRate({ percentage: 20, inclusive: true }),
		});
		expect(preview?.total).toBe(0);
		expect(preview?.amount_inclusive).toBeCloseTo(16.67, 2);
	});

	test("tax is summed across lines", () => {
		const preview = computeInvoiceTaxPreview({
			taxableAmounts: [100, 50],
			currency: "usd",
			taxRate: taxRate({ percentage: 10, inclusive: false }),
		});
		expect(preview?.total).toBe(15);
	});
});
