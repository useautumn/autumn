import { describe, expect, test } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";
import type { AutumnLogger } from "@autumn/logging";
import { AppEnv, type ChatApproval } from "@autumn/shared";
import type { ActionEvent } from "chat";
import { approvalErrorResult } from "../../../src/internal/approvals/utils/approvalErrors.js";
import { approvalRequestFromOutput } from "../../../src/internal/approvals/utils/approvalRequest.js";
import {
	createPreviewCapture,
	isToolErrorResult,
} from "../../../src/agent/tools/toolPolicy.js";
import type { AgentOutput } from "../../../src/types.js";

const setLeafTestEnv = () => {
	process.env.DATABASE_URL ??= "postgres://postgres:postgres@localhost:5432/db";
	process.env.ENCRYPTION_PASSWORD ??= "test-password";
	process.env.FIRECRAWL_API_KEY ??= "test-firecrawl-key";
	process.env.SLACK_CLIENT_ID ??= "test-slack-client-id";
	process.env.SLACK_CLIENT_SECRET ??= "test-slack-client-secret";
	process.env.SLACK_SIGNING_SECRET ??= "test-slack-signing-secret";
};

const testLogger = {
	child: () => testLogger,
	debug: () => {},
	error: () => {},
	info: () => {},
	warn: () => {},
	warning: () => {},
} as unknown as AutumnLogger;

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
			runId: undefined,
			toolCallId: undefined,
			toolName: "updateSubscription",
			toolArgs: { request: { customer_id: "cus_1", plan_id: "pro" } },
			preview: { total: 100 },
		});
	});

	test("does not capture failed previews as approval candidates", () => {
		const previewCapture = createPreviewCapture();
		const failedPreview = {
			isError: true,
			content: [
				{
					type: "text",
					text: JSON.stringify({
						id: "TOOL_EXECUTION_FAILED",
						details: { errorMessage: "plan_already_attached" },
					}),
				},
			],
		};

		expect(isToolErrorResult(failedPreview)).toBe(true);
		previewCapture.onToolCall({
			name: "previewAttach",
			input: { customer_id: "cus_1", product_id: "enterprise" },
		});
		previewCapture.onToolResult({
			name: "previewAttach",
			output: failedPreview,
		});

		expect(previewCapture.captured).toBeUndefined();
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
		const { isErrorResult } = await import(
			"../../../src/internal/approvals/utils/approvalErrors.js"
		);

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
			"../../../src/internal/approvals/actions/handleApprovalAction.js"
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

		await handleApprovalActionWithDeps({
			event,
			deps: {
				approveAndRun: async () => ({
					error: true,
					message: "Missing email.",
				}),
				cancelApproval: async () => approval,
				editActionMessage: async ({ content }) => {
					edits.push(content);
				},
				getApproval: async () => approval,
				logger: {
					error: () => {},
					info: () => {},
					warn: () => {},
				},
			},
		});

		expect(edits).toHaveLength(2);
		expect(JSON.stringify(edits[0])).toContain("Applying the approved action");
		expect(JSON.stringify(edits[1])).toContain("Attach plan failed");
		expect(JSON.stringify(edits[1])).toContain("Missing email.");
	});

	test("denies and cancels stale pending approvals before a new user message", async () => {
		setLeafTestEnv();
		const { cancelPendingSessionApprovalsWithDeps } = await import(
			"../../../src/internal/approvals/actions/cancelPendingSessionApprovals.js"
		);
		const approval = {
			id: "approval_1",
			tool_call_id: "tool_use_1",
		} as ChatApproval;
		const sentEvents: unknown[] = [];
		const cancelled: unknown[] = [];
		const client = {
			beta: {
				sessions: {
					events: {
						send: async (_sessionId: string, body: { events: unknown[] }) => {
							sentEvents.push(...body.events);
						},
					},
				},
			},
		} as unknown as Anthropic;

		const result = await cancelPendingSessionApprovalsWithDeps({
			client,
			db: {} as never,
			logger: testLogger,
			providerUserId: "U1",
			query: {
				channelId: "C1",
				env: AppEnv.Sandbox,
				orgId: "org_1",
				provider: "slack",
				runId: "sesn_1",
				workspaceId: "T1",
			},
			sessionId: "sesn_1",
			deps: {
				cancelApproval: async (input) => {
					cancelled.push(input);
					return approval;
				},
				driveTurn: async ({ kickoff }) => {
					await kickoff();
					return {
						textParts: [],
						usage: {
							cacheCreationInputTokens: 0,
							cacheReadInputTokens: 0,
							inputTokens: 0,
							outputTokens: 0,
						},
					};
				},
				listPendingApprovals: async () => [approval],
			},
		});

		expect(result.cancelledCount).toBe(1);
		expect(sentEvents).toEqual([
			{
				deny_message: "User sent new instructions before approving this action.",
				result: "deny",
				tool_use_id: "tool_use_1",
				type: "user.tool_confirmation",
			},
		]);
		expect(cancelled).toEqual([
			{
				approvalId: "approval_1",
				db: {},
				providerUserId: "U1",
			},
		]);
	});

	test("cancels pending approvals without a tool call id", async () => {
		setLeafTestEnv();
		const { cancelPendingSessionApprovalsWithDeps } = await import(
			"../../../src/internal/approvals/actions/cancelPendingSessionApprovals.js"
		);
		const approval = {
			id: "approval_1",
			tool_call_id: null,
		} as ChatApproval;
		const cancelled: unknown[] = [];

		await cancelPendingSessionApprovalsWithDeps({
			client: {} as Anthropic,
			db: {} as never,
			logger: testLogger,
			providerUserId: "U1",
			query: {
				channelId: "C1",
				env: AppEnv.Sandbox,
				orgId: "org_1",
				provider: "slack",
				runId: "sesn_1",
				workspaceId: "T1",
			},
			sessionId: "sesn_1",
			deps: {
				cancelApproval: async (input) => {
					cancelled.push(input);
					return approval;
				},
				driveTurn: async () => {
					throw new Error("should not drive session");
				},
				listPendingApprovals: async () => [approval],
			},
		});

		expect(cancelled).toHaveLength(1);
	});
});
