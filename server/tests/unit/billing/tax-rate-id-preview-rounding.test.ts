import { describe, expect, test } from "bun:test";
import type { BillingContext } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeTaxRateIdPreviewFromTaxableMinorUnits } from "@/internal/billing/v2/utils/billingPlan/preview/tax/computeAttachTaxRateIdPreview";

const previewTax = ({
	taxableMinorUnits,
	percentage = 20,
	inclusive = false,
}: {
	taxableMinorUnits: number[];
	percentage?: number;
	inclusive?: boolean;
}) =>
	computeTaxRateIdPreviewFromTaxableMinorUnits({
		ctx: {} as AutumnContext,
		billingContext: {
			currency: "usd",
			taxRateId: "txr_test",
			stripeTaxRate: { percentage, inclusive },
		} as unknown as BillingContext,
		taxableMinorUnits,
	});

describe("computeTaxRateIdPreviewFromTaxableMinorUnits rounding", () => {
	test("downgrade credit: rounds tax once on the net subtotal like the Stripe invoice", () => {
		const tax = previewTax({ taxableMinorUnits: [-4194, 1677] });

		expect(tax?.total).toBe(-5.03);
		expect(tax?.amount_exclusive).toBe(-5.03);
	});

	test("positive lines: rounds tax once on the subtotal", () => {
		const tax = previewTax({ taxableMinorUnits: [1678, 1678] });

		expect(tax?.total).toBe(6.71);
	});

	test("inclusive rate: backs tax out of the subtotal once", () => {
		const tax = previewTax({
			taxableMinorUnits: [1006, 1006],
			percentage: 10,
			inclusive: true,
		});

		expect(tax?.total).toBe(0);
		expect(tax?.amount_inclusive).toBe(1.83);
	});
});
