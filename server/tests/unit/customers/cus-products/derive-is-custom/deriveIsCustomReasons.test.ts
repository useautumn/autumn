import { describe, expect, test } from "bun:test";
import {
	basePrice,
	booleanItem,
	catalogPlan,
	customerPlan,
	derive,
	includedItem,
	planLicense,
} from "./isCustomFixtures";

const reasonsOf = ({
	customer,
	catalog,
}: {
	customer: Parameters<typeof customerPlan>[0];
	catalog: Parameters<typeof catalogPlan>[0];
}) => {
	const result = derive({
		customer: customerPlan(customer),
		catalog: catalogPlan(catalog),
	});
	if (result.outcome !== "customized") {
		throw new Error(`expected a customized result, got ${result.outcome}`);
	}
	return result.reasons;
};

describe("deriveCustomerProductIsCustom reasons", () => {
	test("every difference gets its own reason, base price first", () => {
		expect(
			reasonsOf({
				catalog: {
					prices: [basePrice({ amount: 49 })],
					items: [includedItem({ allowance: 300 })],
				},
				customer: {
					prices: [basePrice({ amount: 39 })],
					items: [includedItem({ allowance: 200 }), booleanItem()],
				},
			}),
		).toEqual([
			{ kind: "price_changed" },
			{ kind: "item_changed", feature_id: "credits" },
			{ kind: "item_added", feature_id: "sso" },
		]);
	});

	test("removed base price and items read as removed", () => {
		expect(
			reasonsOf({
				catalog: { prices: [basePrice()], items: [includedItem()] },
				customer: { prices: [], items: [] },
			}),
		).toEqual([
			{ kind: "price_removed" },
			{ kind: "item_removed", feature_id: "credits" },
		]);
	});

	test("licenses tell added and changed apart", () => {
		expect(
			reasonsOf({ catalog: {}, customer: { licenses: [planLicense()] } }),
		).toEqual([{ kind: "license_added", license_plan_id: "seat_plan" }]);
		expect(
			reasonsOf({
				catalog: { licenses: [planLicense({ included: 2 })] },
				customer: { licenses: [planLicense({ included: 20 })] },
			}),
		).toEqual([{ kind: "license_changed", license_plan_id: "seat_plan" }]);
	});

	test("a plan with no difference has no reasons field", () => {
		const plan = { items: [includedItem()], prices: [basePrice()] };
		const result = derive({
			customer: customerPlan(plan),
			catalog: catalogPlan(plan),
		});
		expect("reasons" in result).toBe(false);
	});
});
