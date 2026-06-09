import { describe, expect, test } from "bun:test";
import { AppEnv, type ChatApproval } from "@autumn/shared";
import type { ActionEvent } from "chat";
import { approvalErrorResult } from "../../../src/approvals/errors.js";
import { approvalRequestFromOutput } from "../../../src/approvals/request.js";
import type { AgentOutput } from "../../../src/types.js";

const setLeafTestEnv = () => {
	process.env.DATABASE_URL ??= "postgres://postgres:postgres@localhost:5432/db";
	process.env.ENCRYPTION_PASSWORD ??= "test-password";
	process.env.FIRECRAWL_API_KEY ??= "test-firecrawl-key";
	process.env.SLACK_CLIENT_ID ??= "test-slack-client-id";
	process.env.SLACK_CLIENT_SECRET ??= "test-slack-client-secret";
	process.env.SLACK_SIGNING_SECRET ??= "test-slack-signing-secret";
};

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

	test("formats Autumn API errors for Slack approval cards", () => {
		const result = approvalErrorResult(
			new Error(
				'Autumn API request failed (400): {"message":"(Stripe Error) Missing email. In order to create invoices that are sent to the customer, the customer must have a valid email.","code":"stripe_error","env":"sandbox"}',
			),
		);

		expect(result).toEqual({
			error: true,
			message:
				"(Stripe Error) Missing email. In order to create invoices that are sent to the customer, the customer must have a valid email.",
		});
	});

	test("formats returned tool failure objects for Slack approval cards", () => {
		const result = approvalErrorResult({
			id: "TOOL_EXECUTION_FAILED",
			error: {
				message:
					'Autumn API request failed (400): {"message":"Missing email.","code":"stripe_error"}',
			},
		});

		expect(result).toEqual({
			error: true,
			message: "Missing email.",
		});
	});

	test("formats MCP isError responses for Slack approval cards", () => {
		const result = approvalErrorResult({
			isError: true,
			content: [
				{
					type: "text",
					text: JSON.stringify({
						id: "TOOL_EXECUTION_FAILED",
						details: {
							errorMessage:
								'Error: Autumn API request failed (404): {"message":"Feature definitely_missing_feature_123 not found","code":"feature_not_found","env":"sandbox"}',
						},
					}),
				},
			],
		});

		expect(result).toEqual({
			error: true,
			message: "Feature definitely_missing_feature_123 not found",
		});
	});

	test("detects MCP isError responses as failed tool results", async () => {
		setLeafTestEnv();
		const { isErrorResult } = await import("../../../src/approvals/store.js");

		expect(
			isErrorResult({
				isError: true,
				content: [{ type: "text", text: "Tool failed" }],
			}),
		).toBe(true);
	});

	test("edits the approval message to failed when the approved tool fails", async () => {
		setLeafTestEnv();
		const { handleApprovalActionWithDeps } = await import(
			"../../../src/approvals/flow.js"
		);
		const edits: unknown[] = [];
		const approval = {
			env: AppEnv.Sandbox,
			status: "pending",
			tool_name: "attach",
			tool_args: {
				request: {
					customer_id: "cus_1",
					plan_id: "pro",
				},
			},
		} as unknown as ChatApproval;
		const event = {
			actionId: "approve_billing_action",
			messageId: "message_1",
			threadId: "thread_1",
			user: { userId: "U1" },
			value: "approval_1",
		} as unknown as ActionEvent;

		await handleApprovalActionWithDeps(event, {
			approveAndRun: async () => ({
				error: true,
				message: "Missing email.",
			}),
			cancelApproval: async () => approval,
			editActionMessage: async (_event, content) => {
				edits.push(content);
			},
			getApproval: async () => approval,
			logger: {
				error: () => {},
				info: () => {},
				warn: () => {},
			},
		});

		expect(edits).toHaveLength(2);
		expect(JSON.stringify(edits[0])).toContain("Applying the approved action");
		expect(JSON.stringify(edits[1])).toContain("Attach plan failed");
		expect(JSON.stringify(edits[1])).toContain("Missing email.");
	});
});
