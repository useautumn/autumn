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

	test("links createSchedule (per-plan customize is schema-restricted to seedable keys)", () => {
		expect(
			dashboardLinkableApproval({
				approval: {
					...base,
					tool_args: {
						request: {
							customer_id: "cus_1",
							phases: [
								{
									plans: [
										{ customize: { price: { amount: 900 } }, plan_id: "scale" },
									],
									starts_at: "now",
								},
							],
						},
					},
					tool_name: "autumn__createSchedule",
				},
				groupedStepCount: 0,
			}),
		).toBe(true);
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

	test("excludes billing_controls customize (no sheet control for it)", () => {
		expect(
			dashboardLinkableApproval({
				approval: {
					...base,
					tool_args: {
						request: {
							customer_id: "cus_1",
							customize: { billing_controls: { spend_limits: [] } },
						},
					},
					tool_name: "attach",
				},
				groupedStepCount: 0,
			}),
		).toBe(false);
	});

	test("excludes grouped, unresolvable customize, and non-sheet tools (internal admin links too)", () => {
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
		).toBe(true);
		expect(
			dashboardLinkableApproval({
				approval: { ...base, tool_name: "updateCatalog" },
				groupedStepCount: 0,
			}),
		).toBe(false);
	});
});
