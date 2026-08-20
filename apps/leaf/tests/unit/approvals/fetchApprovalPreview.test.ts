import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import {
	fetchApprovalPreview,
	shouldRefreshApprovalPreview,
	withGroupedWritePreviews,
} from "../../../src/internal/approvals/utils/fetchApprovalPreview.js";

const silentLogger = { warn: () => {} };

describe("fetchApprovalPreview", () => {
	test("refreshes catalog previews for the exact post-decision write", () => {
		expect(
			shouldRefreshApprovalPreview({
				preview: { plan_changes: [] },
				toolName: "autumn__updateCatalog",
			}),
		).toBe(true);
		expect(
			shouldRefreshApprovalPreview({
				preview: { total: 100 },
				toolName: "updateSubscription",
			}),
		).toBe(false);
	});

	test("expands plans in catalog previews", async () => {
		const calls: Array<{ args: unknown; toolName: string }> = [];
		await fetchApprovalPreview({
			env: AppEnv.Sandbox,
			executeTool: async ({ args, toolName }) => {
				calls.push({ args, toolName });
				return { plan_changes: [], feature_changes: [] };
			},
			logger: silentLogger,
			request: { expand: ["feature"], plans: [{ plan_id: "growth" }] },
			token: "tok",
			toolName: "updateCatalog",
		});

		expect(calls).toEqual([
			{
				args: {
					request: {
						expand: ["feature", "plan"],
						features: [],
						plans: [
							{
								include_variants: true,
								include_versions: true,
								plan_id: "growth",
								variants: [],
							},
						],
						skip_deletions: true,
						skip_feature_ids: [],
						skip_plan_ids: [],
					},
				},
				toolName: "previewUpdateCatalog",
			},
		]);
	});

	test("maps write tools to their preview tool", async () => {
		const calls: Array<{ args: unknown; toolName: string }> = [];
		const preview = await fetchApprovalPreview({
			env: AppEnv.Sandbox,
			executeTool: async ({ args, toolName }) => {
				calls.push({ args, toolName });
				return { preview: { total: 100, currency: "usd" } };
			},
			logger: silentLogger,
			request: { customer_id: "cus_1", plan_id: "pro" },
			token: "tok",
			toolName: "autumn_updateSubscription",
		});

		expect(calls).toEqual([
			{
				args: { request: { customer_id: "cus_1", plan_id: "pro" } },
				toolName: "previewUpdateSubscription",
			},
		]);
		expect(preview).toEqual({ preview: { total: 100, currency: "usd" } });
	});

	test.each([
		[
			"createPlan",
			{ name: "Growth", plan_id: "growth" },
			{
				expand: ["plan"],
				features: [],
				plans: [{ name: "Growth", plan_id: "growth" }],
				skip_deletions: true,
				skip_feature_ids: [],
				skip_plan_ids: [],
			},
		],
		[
			"createReward",
			{ coupon: { id: "launch" } },
			{
				features: [],
				plans: [],
				rewards: [{ coupon: { id: "launch" } }],
				skip_deletions: true,
				skip_feature_ids: [],
				skip_plan_ids: [],
			},
		],
	] as const)(
		"previews %s through the catalog endpoint",
		async (toolName, request, expected) => {
			const calls: Array<{ args: unknown; toolName: string }> = [];
			await fetchApprovalPreview({
				env: AppEnv.Sandbox,
				executeTool: async ({ args, toolName: calledTool }) => {
					calls.push({ args, toolName: calledTool });
					return {
						feature_changes: [],
						plan_changes: [],
						referral_program_changes: [],
						reward_changes: [],
					};
				},
				logger: silentLogger,
				request,
				token: "tok",
				toolName,
			});

			expect(calls).toEqual([
				{ args: { request: expected }, toolName: "previewUpdateCatalog" },
			]);
		},
	);

	test("skips tools without a preview variant", async () => {
		const preview = await fetchApprovalPreview({
			env: AppEnv.Sandbox,
			executeTool: async () => {
				throw new Error("should not be called");
			},
			logger: silentLogger,
			request: {},
			token: "tok",
			toolName: "updateCustomer",
		});

		expect(preview).toBeUndefined();
	});

	test("reports failure instead of throwing", async () => {
		const preview = await fetchApprovalPreview({
			env: AppEnv.Sandbox,
			executeTool: async () => {
				throw new Error("MCP unreachable");
			},
			logger: silentLogger,
			request: { customer_id: "cus_1" },
			token: "tok",
			toolName: "attach",
		});

		expect(preview).toMatchObject({ failed: true });
	});
});

// A billing card that silently drops to params-only asks the user to approve
// money they were never shown, so a failed preview must be distinguishable
// from a write that simply has no preview tool.
describe("failed billing previews are not silently swallowed", () => {
	test("reports failure for a write whose preview errored", async () => {
		const result = await fetchApprovalPreview({
			env: AppEnv.Sandbox,
			executeTool: async () => ({ error: "upstream exploded" }),
			logger: silentLogger,
			request: { customer_id: "cus_1", plan_id: "pro" },
			token: "tok",
			toolName: "attach",
		});

		expect(result).toMatchObject({ failed: true });
	});

	test("reports failure when the preview tool throws", async () => {
		const result = await fetchApprovalPreview({
			env: AppEnv.Sandbox,
			executeTool: async () => {
				throw new Error("network down");
			},
			logger: silentLogger,
			request: { customer_id: "cus_1", plan_id: "pro" },
			token: "tok",
			toolName: "attach",
		});

		expect(result).toMatchObject({ failed: true });
	});

	test("a write with no preview tool is not a failure", async () => {
		const result = await fetchApprovalPreview({
			env: AppEnv.Sandbox,
			executeTool: async () => ({}),
			logger: silentLogger,
			request: { customer_id: "cus_1", email: "new@x.com" },
			token: "tok",
			toolName: "updateCustomer",
		});

		expect(result).toBeUndefined();
	});
});

// A grouped card renders one money cell per step; a step stored without a
// preview silently shows $0.00, so every withheld write must be backfilled.
describe("withGroupedWritePreviews", () => {
	test("backfills a preview onto every withheld write", async () => {
		const previewedCustomers: string[] = [];
		const toolArgs = await withGroupedWritePreviews({
			env: AppEnv.Sandbox,
			executeTool: async ({ args }) => {
				const request = (args as { request: { customer_id: string } }).request;
				previewedCustomers.push(request.customer_id);
				return { currency: "usd", due_today: { total: 2400 }, total: 2400 };
			},
			getToken: async () => "tok",
			logger: silentLogger,
			toolArgs: {
				_eveWithheldWrites: [
					{
						input: { request: { customer_id: "cus_2", plan_id: "pack" } },
						requestId: "req_2",
						toolName: "autumn__attach",
					},
					{
						input: { request: { customer_id: "cus_3", plan_id: "pack" } },
						requestId: "req_3",
						toolName: "autumn__attach",
					},
				],
				request: { customer_id: "cus_1", plan_id: "pack" },
			},
		});

		expect(previewedCustomers.sort()).toEqual(["cus_2", "cus_3"]);
		const withheld = toolArgs._eveWithheldWrites as Array<{
			preview?: { preview?: { total?: number } };
		}>;
		expect(withheld).toHaveLength(2);
		for (const step of withheld) {
			expect(step.preview?.preview?.total).toBe(2400);
		}
	});

	test("keeps the step and card alive when one preview fails", async () => {
		const toolArgs = await withGroupedWritePreviews({
			env: AppEnv.Sandbox,
			executeTool: async ({ args }) => {
				const request = (args as { request: { customer_id: string } }).request;
				if (request.customer_id === "cus_2") throw new Error("boom");
				return { total: 2400 };
			},
			getToken: async () => "tok",
			logger: silentLogger,
			toolArgs: {
				_eveWithheldWrites: [
					{
						input: { request: { customer_id: "cus_2", plan_id: "pack" } },
						requestId: "req_2",
						toolName: "autumn__attach",
					},
					{
						input: { request: { customer_id: "cus_3", plan_id: "pack" } },
						requestId: "req_3",
						toolName: "autumn__attach",
					},
				],
				request: { customer_id: "cus_1", plan_id: "pack" },
			},
		});

		const withheld = toolArgs._eveWithheldWrites as Array<{
			preview?: {
				failed?: boolean;
				preview?: { failed?: boolean; total?: number };
			};
			toolName: string;
		}>;
		expect(withheld).toHaveLength(2);
		expect(
			withheld[0].preview?.failed ?? withheld[0].preview?.preview?.failed,
		).toBe(true);
		expect(withheld[1].preview?.preview?.total).toBe(2400);
	});
});
