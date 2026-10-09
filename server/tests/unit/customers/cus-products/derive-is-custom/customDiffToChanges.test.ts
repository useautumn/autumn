import { describe, expect, test } from "bun:test";
import { customDiffToChanges } from "@/internal/customers/cusProducts/actions/deriveIsCustom/customDiffToChanges";
import {
	basePrice,
	booleanItem,
	catalogPlan,
	customerPlan,
	derive,
	includedItem,
	prepaidItem,
} from "./isCustomFixtures";

const changesOf = ({
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
	if (result.reason !== "customized") throw new Error(result.reason);
	return customDiffToChanges({ diff: result.diff });
};

describe("customDiffToChanges", () => {
	test("a changed item lists only the fields that moved, both sides", () => {
		expect(
			changesOf({
				catalog: { items: [prepaidItem({ amount: 10, billingUnits: 100 })] },
				customer: { items: [prepaidItem({ amount: 8, billingUnits: 1_000 })] },
			}),
		).toEqual([
			{
				target: "item",
				id: "credits",
				kind: "changed",
				fields: [
					{ path: "price.amount", catalog: "10", customer: "8" },
					{ path: "price.billing_units", catalog: "100", customer: "1000" },
				],
			},
		]);
	});

	test("an added item carries only the customer's side, a removed one only the catalog's", () => {
		const changes = changesOf({
			catalog: { items: [includedItem()] },
			customer: { items: [booleanItem()] },
		});
		const byKind = Object.fromEntries(
			changes.map((change) => [change.kind, change]),
		);

		expect(byKind.removed?.id).toBe("credits");
		expect(byKind.removed?.fields.every((f) => f.customer === null)).toBe(true);
		expect(byKind.added?.id).toBe("sso");
		expect(byKind.added?.fields.every((f) => f.catalog === null)).toBe(true);
	});

	test("a base price change comes first", () => {
		const [first] = changesOf({
			catalog: { prices: [basePrice({ amount: 49 })], items: [includedItem()] },
			customer: {
				prices: [basePrice({ amount: 39 })],
				items: [includedItem({ allowance: 100 })],
			},
		});
		expect(first?.target).toBe("base_price");
		expect(first?.fields).toContainEqual({
			path: "amount",
			catalog: "49",
			customer: "39",
		});
	});
});
