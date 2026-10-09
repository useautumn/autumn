import { describe, expect, test } from "bun:test";
import { BillingInterval } from "@autumn/shared";
import type { CustomerProductCustomDiff } from "@/internal/customers/cusProducts/actions/deriveIsCustom/types/customerProductCustomDiff";
import {
	basePrice,
	booleanItem,
	catalogPlan,
	customerPlan,
	derive,
	includedItem,
	type PlanItemRows,
	planLicense,
	prepaidItem,
} from "./isCustomFixtures";

const diffOf = ({
	customer,
	catalog,
}: {
	customer: Parameters<typeof customerPlan>[0];
	catalog: Parameters<typeof catalogPlan>[0];
}): CustomerProductCustomDiff => {
	const result = derive({
		customer: customerPlan(customer),
		catalog: catalogPlan(catalog),
	});
	if (result.reason !== "customized") {
		throw new Error(`expected a customized result, got ${result.reason}`);
	}
	return result.diff;
};

const items = (...rows: PlanItemRows[]) => ({ items: rows });

describe("deriveCustomerProductIsCustom diff", () => {
	test("an edited item reads as one change with both sides", () => {
		const diff = diffOf({
			catalog: items(includedItem({ allowance: 300 })),
			customer: items(includedItem({ allowance: 200 })),
		});

		expect(diff).toEqual({
			items: [
				{
					feature_id: "credits",
					catalog: expect.objectContaining({ included: 300 }),
					customer: expect.objectContaining({ included: 200 }),
				},
			],
		});
	});

	test("an item only the customer has reads as added", () => {
		const diff = diffOf({
			catalog: items(includedItem()),
			customer: items(includedItem(), booleanItem()),
		});

		expect(diff.items).toEqual([
			{
				feature_id: "sso",
				catalog: null,
				customer: expect.objectContaining({ feature_id: "sso" }),
			},
		]);
	});

	test("an item only the plan has reads as removed", () => {
		const diff = diffOf({
			catalog: items(includedItem(), booleanItem()),
			customer: items(includedItem()),
		});

		expect(diff.items).toEqual([
			{
				feature_id: "sso",
				catalog: expect.objectContaining({ feature_id: "sso" }),
				customer: null,
			},
		]);
	});

	test("a billing method change reads as a removed and an added item", () => {
		const diff = diffOf({
			catalog: items(includedItem()),
			customer: items(prepaidItem()),
		});

		expect(diff.items?.[0]?.catalog?.price).toBeUndefined();
		expect(diff.items).toEqual([
			{
				feature_id: "credits",
				catalog: expect.objectContaining({ included: 200 }),
				customer: null,
			},
			{
				feature_id: "credits",
				catalog: null,
				customer: expect.objectContaining({
					price: expect.objectContaining({ billing_method: "prepaid" }),
				}),
			},
		]);
	});

	test("unchanged items are left out", () => {
		const diff = diffOf({
			catalog: items(includedItem(), booleanItem()),
			customer: items(includedItem({ allowance: 999 }), booleanItem()),
		});

		expect(diff.items?.map((item) => item.feature_id)).toEqual(["credits"]);
	});

	test("snapshots carry terms only, never row or Stripe ids", () => {
		const diff = diffOf({
			catalog: items(prepaidItem({ amount: 10 })),
			customer: items(prepaidItem({ amount: 8 })),
		});

		const serialized = JSON.stringify(diff);
		expect(serialized).not.toContain("ent_credits");
		expect(serialized).not.toContain("pr_credits");
		expect(serialized).not.toContain("stripe_");
		expect(diff.items?.[0]?.customer?.price).toEqual(
			expect.objectContaining({ amount: 8, billing_method: "prepaid" }),
		);
	});

	test("a base price change carries both prices", () => {
		const diff = diffOf({
			catalog: { prices: [basePrice({ amount: 49 })] },
			customer: { prices: [basePrice({ amount: 39 })] },
		});

		expect(diff).toEqual({
			price: {
				catalog: { amount: 49, interval: BillingInterval.Month },
				customer: { amount: 39, interval: BillingInterval.Month },
			},
		});
	});

	test("a free customer on a paid plan carries a null customer price", () => {
		const diff = diffOf({
			catalog: { prices: [basePrice({ amount: 49 })] },
			customer: { prices: [] },
		});

		expect(diff.price).toEqual({
			catalog: { amount: 49, interval: BillingInterval.Month },
			customer: null,
		});
	});

	describe("licenses", () => {
		test("a different included amount → upsert with the customer's terms", () => {
			const diff = diffOf({
				catalog: { licenses: [planLicense({ included: 2 })] },
				customer: { licenses: [planLicense({ included: 20 })] },
			});

			expect(diff.upsert_licenses).toEqual([
				expect.objectContaining({ license_plan_id: "seat_plan", included: 20 }),
			]);
		});

		test("a license the plan does not have → upsert", () => {
			const diff = diffOf({
				catalog: { licenses: [planLicense()] },
				customer: {
					licenses: [planLicense(), planLicense({ licensePlanId: "extra" })],
				},
			});

			expect(diff.upsert_licenses).toEqual([
				expect.objectContaining({ license_plan_id: "extra" }),
			]);
		});

		test("identical licenses → not custom", () => {
			expect(
				derive({
					customer: customerPlan({ licenses: [planLicense()] }),
					catalog: catalogPlan({ licenses: [planLicense()] }),
				}).isCustom,
			).toBe(false);
		});
	});

	test("every lane that differs is reported together", () => {
		const diff = diffOf({
			catalog: {
				prices: [basePrice({ amount: 49 })],
				items: [includedItem({ allowance: 300 })],
				licenses: [planLicense({ included: 2 })],
			},
			customer: {
				prices: [basePrice({ amount: 39 })],
				items: [includedItem({ allowance: 200 })],
				licenses: [planLicense({ included: 5 })],
			},
		});

		expect(Object.keys(diff).sort()).toEqual([
			"items",
			"price",
			"upsert_licenses",
		]);
	});
});
