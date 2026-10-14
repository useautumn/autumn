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

describe("paid schedule invoice mode", () => {
	const paidSchedule = (invoiceMode: Record<string, unknown>) => ({
		...request,
		enable_plan_immediately: true,
		redirect_mode: "if_required",
		invoice_mode: { enabled: true, ...invoiceMode },
	});

	test("accepts only a draft invoice, resolving issue_method over finalize", () => {
		const accepts = (invoiceMode: Record<string, unknown>) =>
			schemaByTool.setPlans.safeParse(paidSchedule(invoiceMode)).success;

		expect(accepts({ finalize: false })).toBe(true);
		expect(accepts({ issue_method: "draft" })).toBe(true);
		expect(accepts({ finalize: true, issue_method: "draft" })).toBe(true);
		expect(accepts({ finalize: false, issue_method: "send" })).toBe(false);
		expect(accepts({ finalize: false, issue_method: "finalize" })).toBe(false);
		expect(accepts({})).toBe(false);
	});
});
