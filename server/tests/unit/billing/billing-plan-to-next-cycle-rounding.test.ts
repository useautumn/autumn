import { describe, expect, test } from "bun:test";
import type {
	AutumnBillingPlan,
	BillingContext,
	LineItem,
	Organization,
} from "@autumn/shared";
import { lineItems } from "@tests/utils/fixtures/billing/lineItems";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingPlanToNextCycleLineItems } from "@/internal/billing/v2/utils/billingPlan/toNextCyclePreview/billingPlanToNextCycleLineItems";

const nextCycle = ({
	amounts,
	currency,
}: {
	amounts: number[];
	currency: string;
}) =>
	billingPlanToNextCycleLineItems({
		ctx: {
			org: {
				id: "org_test",
				default_currency: currency,
				config: { disable_overage_billing: false },
			} as unknown as Organization,
		} as AutumnContext,
		customerProducts: [],
		lineItemSpecs: [],
		autumnBillingPlan: {
			lineItems: amounts.map(
				(amount): LineItem => ({
					...lineItems.charge({ amount }),
					chargeImmediately: false,
				}),
			),
		} as unknown as AutumnBillingPlan,
		billingContext: {
			currency,
			fullCustomer: { id: "cus_test" },
		} as unknown as BillingContext,
		nextCycleStart: Date.now(),
	});

describe("billingPlanToNextCycleLineItems rounding", () => {
	test("USD: rounds a prorated stub to whole cents", () => {
		const result = nextCycle({ amounts: [3.870967741935484], currency: "usd" });

		expect(result.previewLineItems.map((line) => line.total)).toEqual([3.87]);
		expect(result.subtotal).toBe(3.87);
		expect(result.total).toBe(3.87);
	});

	test("USD: rounds each line before summing so lines add up to the total", () => {
		// 100.006 + 125.646 = 225.652 -> 225.65 if rounded once, but Stripe bills 100.01 + 125.65
		const result = nextCycle({ amounts: [100.006, 125.646], currency: "usd" });

		expect(result.previewLineItems.map((line) => line.total)).toEqual([
			100.01, 125.65,
		]);
		expect(result.subtotal).toBe(225.66);
		expect(result.total).toBe(225.66);
	});

	test("JPY: rounds each line to whole yen before summing", () => {
		const result = nextCycle({
			amounts: [333.4, 333.4, 333.4],
			currency: "jpy",
		});

		expect(result.total).toBe(999);
	});
});
