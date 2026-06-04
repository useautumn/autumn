import { AppEnv } from "@autumn/shared";
import { describe, expect, test } from "bun:test";
import { approvalRequestFromOutput } from "../../../src/approvals/request.js";
import type { AgentOutput } from "../../../src/types.js";

describe("approval flow", () => {
	test("maps suspended destructive tool output to a pending approval request", () => {
		const request = approvalRequestFromOutput({
			env: AppEnv.Sandbox,
			finishReason: "suspended",
			runId: "run_1",
			suspendPayload: {
				toolCallId: "call_1",
				toolName: "attach",
				args: { request: { customer_id: "cus_1", plan_id: "pro" } },
			},
			text: "Preview ready.",
		} satisfies AgentOutput);

		expect(request).toEqual({
			env: AppEnv.Sandbox,
			runId: "run_1",
			toolCallId: "call_1",
			toolName: "attach",
			toolArgs: { request: { customer_id: "cus_1", plan_id: "pro" } },
			preview: "Preview ready.",
		});
	});

	test("maps preview output to the matching write approval request", () => {
		const request = approvalRequestFromOutput({
			env: AppEnv.Live,
			previewApproval: {
				toolName: "updateSubscription",
				toolArgs: { request: { customer_id: "cus_1", plan_id: "pro" } },
				preview: { total: 100 },
			},
		} satisfies AgentOutput);

		expect(request).toEqual({
			env: AppEnv.Live,
			toolName: "updateSubscription",
			toolArgs: { request: { customer_id: "cus_1", plan_id: "pro" } },
			preview: { total: 100 },
		});
	});
});
