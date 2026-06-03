import { CustomerFilterSchema } from "@autumn/shared/api/migrations/filters/customerFilter.js";
import { describe, expect, it } from "bun:test";

// Regression: the quantifier wrapper must win over the permissive element in
// arrayFilter's union, otherwise PlanFilterSchema strips `$none`/`$some`/
// `$every` down to `{}` and the filter silently degrades to "has any plan".
describe("arrayFilter quantifier preservation", () => {
	it("preserves $none with an empty inner filter", () => {
		const parsed = CustomerFilterSchema.parse({ plan: { $none: {} } });
		expect(parsed).toEqual({ plan: { $none: {} } });
	});

	it("preserves $none with an inner plan_id matcher", () => {
		const parsed = CustomerFilterSchema.parse({
			plan: { $none: { plan_id: { $in: ["pro"] } } },
		});
		expect(parsed).toEqual({ plan: { $none: { plan_id: { $in: ["pro"] } } } });
	});

	it("keeps a bare element filter as implicit $some", () => {
		const parsed = CustomerFilterSchema.parse({ plan: { plan_id: "pro" } });
		expect(parsed).toEqual({ plan: { plan_id: "pro" } });
	});

	it("keeps an $or element filter (not mistaken for a quantifier)", () => {
		const parsed = CustomerFilterSchema.parse({
			plan: { $or: [{ paid: true }] },
		});
		expect(parsed).toEqual({ plan: { $or: [{ paid: true }] } });
	});
});
