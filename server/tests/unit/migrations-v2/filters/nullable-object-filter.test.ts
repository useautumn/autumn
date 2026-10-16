import { describe, expect, it } from "bun:test";
import { CustomerFilterSchema } from "@autumn/shared/api/migrations/filters/customerFilter.js";
import { PlanItemFilterSchema } from "@autumn/shared/api/migrations/filters/planItemFilter.js";

// Regression: the `{ $eq: null } / { $ne: null }` branch accepted any object
// and stripped it, so nested conditions silently widened to "any value".
describe("nullableObjectFilter keeps nested conditions", () => {
	it("keeps price.billing_method on an item filter", () => {
		const parsed = PlanItemFilterSchema.parse({
			price: { billing_method: "prepaid" },
		});
		expect(parsed).toEqual({ price: { billing_method: "prepaid" } });
	});

	it("keeps a nested item price condition inside a customer filter", () => {
		const filter = {
			plan: { $some: { item: { price: { billing_method: "usage_based" } } } },
		};
		expect(CustomerFilterSchema.parse(filter)).toEqual(filter);
	});

	it("still accepts the null shorthands", () => {
		for (const price of [null, { $eq: null }, { $ne: null }]) {
			expect(PlanItemFilterSchema.parse({ price })).toEqual({ price });
		}
	});
});
