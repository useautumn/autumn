import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import {
	fetchApprovalPreview,
	shouldRefreshApprovalPreview,
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

	test("skips tools without a preview variant", async () => {
		const preview = await fetchApprovalPreview({
			env: AppEnv.Sandbox,
			executeTool: async () => {
				throw new Error("should not be called");
			},
			logger: silentLogger,
			request: {},
			token: "tok",
			toolName: "createBalance",
		});

		expect(preview).toBeUndefined();
	});

	test("returns undefined instead of throwing on failure", async () => {
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

		expect(preview).toBeUndefined();
	});
});
