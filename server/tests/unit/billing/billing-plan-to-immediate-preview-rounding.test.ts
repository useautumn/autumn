import { describe, expect, test } from "bun:test";
import type {
	BillingContext,
	BillingPlan,
	CustomLineItem,
	LineItem,
} from "@autumn/shared";
import { lineItems } from "@tests/utils/fixtures/billing/lineItems";
import { billingPlanToImmediatePreview } from "@/internal/billing/v2/utils/billingPlan/toImmediatePreview/billingPlanToImmediatePreview";

const preview = ({
	lines = [],
	customLineItems,
	currency,
}: {
	lines?: LineItem[];
	customLineItems?: CustomLineItem[];
	currency: string;
}) =>
	billingPlanToImmediatePreview({
		billingContext: {} as BillingContext,
		billingPlan: {
			autumn: { lineItems: lines, customLineItems },
		} as unknown as BillingPlan,
		currency,
	});

const charges = (amounts: number[]) =>
	amounts.map((amount) => lineItems.charge({ amount }));

describe("billingPlanToImmediatePreview rounding", () => {
	test("USD: rounds each line to cents before summing", () => {
		// 100.006 + 125.646 = 225.652 -> 225.65 if rounded once, but Stripe bills 100.01 + 125.65
		const result = preview({
			lines: charges([100.006, 125.646]),
			currency: "usd",
		});

		expect(result.subtotal).toBe(225.66);
		expect(result.total).toBe(225.66);
	});

	test("JPY: rounds each line to whole yen before summing", () => {
		const result = preview({
			lines: charges([333.4, 333.4, 333.4]),
			currency: "jpy",
		});

		expect(result.subtotal).toBe(999);
		expect(result.total).toBe(999);
	});

	test("custom line items: rounds each line to cents before summing", () => {
		const result = preview({
			customLineItems: [
				{ amount: 100.006, description: "Setup" },
				{ amount: 125.646, description: "Onboarding" },
			],
			currency: "usd",
		});

		expect(result.subtotal).toBe(225.66);
		expect(result.total).toBe(225.66);
	});
});
