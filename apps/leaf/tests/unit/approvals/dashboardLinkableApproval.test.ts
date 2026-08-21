import { describe, expect, test } from "bun:test";
import { dashboardLinkableApproval } from "../../../src/internal/approvals/domain/approvalRecord.js";

const base = {
	provider: "slack" as const,
	tool_args: { request: { customer_id: "cus_1", plan_id: "scale" } },
};

describe("dashboardLinkableApproval", () => {
	test("links single-step attach, including the raw eve tool name", () => {
		for (const toolName of ["attach", "autumn__attach"]) {
			expect(
				dashboardLinkableApproval({
					approval: { ...base, tool_name: toolName },
					groupedStepCount: 0,
				}),
			).toBe(true);
		}
	});

	test("links updateSubscription", () => {
		expect(
			dashboardLinkableApproval({
				approval: { ...base, tool_name: "autumn__updateSubscription" },
				groupedStepCount: 0,
			}),
		).toBe(true);
	});

	test("links seedable customize (price, items, add/remove, trial)", () => {
		for (const customize of [
			{ price: { amount: 1000, interval: "month" } },
			{ items: [] },
			{ add_items: [], remove_items: [{ feature_id: "seats" }] },
			{ free_trial: { duration_length: 7, duration_type: "day" } },
			{ billing_controls: { spend_limits: [] } },
		]) {
			expect(
				dashboardLinkableApproval({
					approval: {
						...base,
						tool_args: { request: { customer_id: "cus_1", customize } },
						tool_name: "attach",
					},
					groupedStepCount: 0,
				}),
			).toBe(true);
		}
	});

	test("excludes grouped, unresolvable customize, internal, and non-sheet tools", () => {
		expect(
			dashboardLinkableApproval({
				approval: { ...base, tool_name: "attach" },
				groupedStepCount: 2,
			}),
		).toBe(false);
		expect(
			dashboardLinkableApproval({
				approval: {
					...base,
					tool_args: {
						request: {
							customer_id: "cus_1",
							customize: { update_items: [{ filter: {}, included: 5 }] },
						},
					},
					tool_name: "attach",
				},
				groupedStepCount: 0,
			}),
		).toBe(false);
		expect(
			dashboardLinkableApproval({
				approval: {
					...base,
					provider: "slack_admin:autumn",
					tool_name: "attach",
				},
				groupedStepCount: 0,
			}),
		).toBe(false);
		expect(
			dashboardLinkableApproval({
				approval: { ...base, tool_name: "updateCatalog" },
				groupedStepCount: 0,
			}),
		).toBe(false);
	});
});
