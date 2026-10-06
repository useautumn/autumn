import { describe, expect, test } from "bun:test";
import { schemaByTool } from "../../../src/tools/index.js";

const request = {
	customer_id: "cus_1",
	phases: [{ plans: [{ plan_id: "pro" }], starts_at: "now" }],
};

describe("setPlans schema", () => {
	test("keeps plans the request leaves out unless told to end them", () => {
		expect(schemaByTool.setPlans.parse(request)).toMatchObject({
			undeclared_plans: "retain",
		});
		expect(
			schemaByTool.setPlans.parse({ ...request, undeclared_plans: "end" }),
		).toMatchObject({ undeclared_plans: "end" });
	});

	test("rejects top-level proration and anchor fields set_plans would drop", () => {
		for (const field of [
			{ proration_behavior: "none" },
			{ billing_cycle_anchor: "now" },
			{ billing_behavior: "none" },
		]) {
			expect(
				schemaByTool.setPlans.safeParse({ ...request, ...field }).success,
			).toBe(false);
		}
	});
});
