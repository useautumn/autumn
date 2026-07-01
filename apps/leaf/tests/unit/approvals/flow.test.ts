import { describe, expect, test } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";
import type { AutumnLogger } from "@autumn/logging";
import { AppEnv, type ChatApproval } from "@autumn/shared";
import type { ActionEvent } from "chat";
import { approvalErrorResult } from "../../../src/internal/approvals/utils/approvalErrors.js";
import { approvalRequestFromOutput } from "../../../src/internal/approvals/utils/approvalRequest.js";
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
	test("maps a suspended write to a pending approval request", () => {
		const request = approvalRequestFromOutput({
			env: AppEnv.Sandbox,
			finishReason: "suspended",
			runId: "run_1",
			suspension: {
				toolCallId: "call_1",
				toolName: "attach",
				toolArgs: { request: { customer_id: "cus_1", plan_id: "pro" } },
				preview: { total: 20 },
			},
			text: "Preview ready.",
		} satisfies AgentOutput);

		expect(request).toEqual({
			env: AppEnv.Sandbox,
			runId: "run_1",
			toolCallId: "call_1",
			toolName: "attach",
			toolArgs: { request: { customer_id: "cus_1", plan_id: "pro" } },
			preview: { total: 20 },
		});
	});

	test("maps a suspended write whose preview wasn't captured (card backfills later)", () => {
		const request = approvalRequestFromOutput({
			env: AppEnv.Live,
			finishReason: "suspended",
			runId: "run_2",
			suspension: {
				toolCallId: "call_2",
				toolName: "updateSubscription",
				toolArgs: { request: { customer_id: "cus_1", plan_id: "pro" } },
			},
		} satisfies AgentOutput);

		expect(request).toEqual({
			env: AppEnv.Live,
			runId: "run_2",
			toolCallId: "call_2",
			toolName: "updateSubscription",
			toolArgs: { request: { customer_id: "cus_1", plan_id: "pro" } },
			preview: undefined,
		});
	});

	test("returns nothing when the turn did not suspend", () => {
		expect(
			approvalRequestFromOutput({
				env: AppEnv.Sandbox,
				text: "Done.",
			} satisfies AgentOutput),
		).toBeUndefined();
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

	test("direct token approvals fail MCP isError results after deleting the suspended session", async () => {
		setLeafTestEnv();
		const { resumeClaudeManagedApprovalWithDeps } = await import(
			"../../../src/harness/claudeManaged/approval.js"
		);
		const calls: string[] = [];
		let resolveDelete: (() => void) | undefined;
		const deleteGate = new Promise<void>((resolve) => {
			resolveDelete = resolve;
		});
		const approval = {
			env: AppEnv.Sandbox,
			org_id: "org_1",
			run_id: "session_1",
			tool_call_id: "tool_1",
			tool_name: "attach",
			tool_args: { request: { customer_id: "cus_1", plan_id: "pro" } },
		} as unknown as ChatApproval;

		let settled = false;
		const run = resumeClaudeManagedApprovalWithDeps({
			approval,
			providerUserId: "U1",
			token: "am_oauth_clicker",
			deps: {
				executeTool: async () => {
					calls.push("execute");
					return {
						isError: true,
						content: [{ type: "text", text: "Tool failed" }],
					};
				},
				deleteResolvedSession: async () => {
					calls.push("delete:start");
					await deleteGate;
					calls.push("delete:end");
				},
				notifySuspendedToolDenied: async () => {
					calls.push("notify");
				},
				driveSessionTurn: async () => {
					throw new Error("should not drive the live session");
				},
				findSessionToolResult: async () => {
					throw new Error("should not recover session history");
				},
			},
		}).then((result) => {
			settled = true;
			return result;
		});

		await Promise.resolve();
		await Promise.resolve();

		expect(calls).toEqual(["execute", "delete:start"]);
		expect(settled).toBe(false);

		resolveDelete?.();
		const result = await run;

		expect(result).toEqual({ error: true, message: "Tool failed" });
		expect(calls).toEqual([
			"execute",
			"delete:start",
			"delete:end",
			"notify",
		]);
	});

	test("edits the approval message to failed when the approved tool fails", async () => {
		setLeafTestEnv();
		const { handleApprovalActionWithDeps } = await import(
			"../../../src/internal/approvals/surfaces/slack/decide.js"
		);
		const edits: unknown[] = [];
		const replies: string[] = [];
		const approval = {
			env: AppEnv.Sandbox,
			expires_at: Date.now() + 60_000,
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
				resolveApproval: async () => ({
					error: true,
					message: "Missing email.",
				}),
				cancelApproval: async () => approval,
				claimApproval: async () => approval,
				editActionMessage: async ({ content }) => {
					edits.push(content);
				},
				getApproval: async () => approval,
				logger: {
					error: () => {},
					info: () => {},
					warn: () => {},
				},
				postThreadReply: async ({ markdown }) => {
					replies.push(markdown);
				},
			},
		});

		expect(edits).toHaveLength(2);
		expect(JSON.stringify(edits[0])).toContain("Attaching **pro**");
		expect(JSON.stringify(edits[1])).toContain("Couldn't attach **pro**");
		expect(JSON.stringify(edits[1])).toContain("Missing email.");
		expect(replies).toHaveLength(0);
	});

	test("claims before acknowledging and posts the outcome to the thread", async () => {
		setLeafTestEnv();
		const { handleApprovalActionWithDeps } = await import(
			"../../../src/internal/approvals/surfaces/slack/decide.js"
		);
		const calls: string[] = [];
		const edits: unknown[] = [];
		const replies: string[] = [];
		const typing: string[] = [];
		const approval = {
			env: AppEnv.Sandbox,
			expires_at: Date.now() + 60_000,
			status: "pending",
			tool_name: "attach",
			tool_args: { request: { customer_id: "cus_1", plan_id: "pro" } },
		} as unknown as ChatApproval;
		const event = {
			actionId: "approve_billing_action",
			messageId: "message_1",
			thread: {
				startTyping: async (message: string) => {
					typing.push(message);
				},
			},
			threadId: "thread_1",
			user: { userId: "U1" },
			value: "approval_1",
		} as unknown as ActionEvent;

		await handleApprovalActionWithDeps({
			event,
			deps: {
				resolveApproval: async () => {
					calls.push("run");
					return { result: { status: "active" }, text: "All done!" };
				},
				cancelApproval: async () => approval,
				claimApproval: async () => {
					calls.push("claim");
					return approval;
				},
				editActionMessage: async ({ content }) => {
					calls.push("edit");
					edits.push(content);
				},
				getApproval: async () => approval,
				logger: { error: () => {}, info: () => {}, warn: () => {} },
				postThreadReply: async ({ markdown }) => {
					replies.push(markdown);
				},
			},
		});

		expect(calls).toEqual(["claim", "edit", "run", "edit"]);
		expect(typing).toEqual([]);
		expect(replies).toEqual(["All done!"]);
		expect(JSON.stringify(edits[1])).toContain("✅ Attached **pro**");
		expect(JSON.stringify(edits[1])).toContain("approved by <@U1>");
	});

	test("releases the claim and does not run when the Slack approver lacks Autumn scopes", async () => {
		setLeafTestEnv();
		const { handleApprovalActionWithDeps } = await import(
			"../../../src/internal/approvals/surfaces/slack/decide.js"
		);
		const calls: string[] = [];
		const replies: string[] = [];
		const approval = {
			env: AppEnv.Sandbox,
			expires_at: Date.now() + 60_000,
			status: "pending",
			tool_name: "createPlan",
			tool_args: { request: { plan_id: "pro" } },
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
				resolveApproval: async () => {
					calls.push("run");
					return { result: {}, text: "ran" };
				},
				cancelApproval: async () => approval,
				authorizeApprovalClicker: async () => ({
					allowed: false,
					text: "Missing plans:write.",
				}),
				claimApproval: async () => {
					calls.push("claim");
					return approval;
				},
				releaseApproval: async () => {
					calls.push("release");
					return approval;
				},
				editActionMessage: async () => {
					calls.push("edit");
				},
				getApproval: async () => approval,
				logger: { error: () => {}, info: () => {}, warn: () => {} },
				postThreadReply: async ({ markdown }) => {
					replies.push(markdown);
				},
			},
		});

		// Claim wins first, then authorization denies and releases it back to
		// pending; the write never runs and no card edit happens.
		expect(calls).toEqual(["claim", "release"]);
		expect(replies).toEqual(["Missing plans:write."]);
	});

	test("releases the claim and does not run when Slack approver authorization throws", async () => {
		setLeafTestEnv();
		const { handleApprovalActionWithDeps } = await import(
			"../../../src/internal/approvals/surfaces/slack/decide.js"
		);
		const calls: string[] = [];
		const replies: string[] = [];
		const edits: unknown[] = [];
		const approval = {
			env: AppEnv.Sandbox,
			expires_at: Date.now() + 60_000,
			status: "pending",
			tool_name: "createPlan",
			tool_args: { request: { plan_id: "pro" } },
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
				resolveApproval: async () => {
					calls.push("run");
					return { result: {}, text: "ran" };
				},
				cancelApproval: async () => approval,
				authorizeApprovalClicker: async () => {
					calls.push("authorize");
					throw new Error("auth exploded");
				},
				claimApproval: async () => {
					calls.push("claim");
					return approval;
				},
				releaseApproval: async () => {
					calls.push("release");
					return approval;
				},
				editActionMessage: async ({ content }) => {
					calls.push("edit");
					edits.push(content);
				},
				getApproval: async () => approval,
				logger: { error: () => {}, info: () => {}, warn: () => {} },
				postThreadReply: async ({ markdown }) => {
					calls.push("reply");
					replies.push(markdown);
				},
			},
		});

		expect(calls).toEqual(["claim", "authorize", "release", "reply"]);
		expect(edits).toEqual([]);
		expect(replies).toEqual([
			"I couldn't verify your Autumn permissions, so I didn't run this action. Please try again.",
		]);
	});

	test("passes the authorized Slack approver token to the approval resolver", async () => {
		setLeafTestEnv();
		const { handleApprovalActionWithDeps } = await import(
			"../../../src/internal/approvals/surfaces/slack/decide.js"
		);
		let resolverToken: string | undefined;
		const approval = {
			env: AppEnv.Sandbox,
			expires_at: Date.now() + 60_000,
			status: "pending",
			tool_name: "createPlan",
			tool_args: { request: { plan_id: "pro" } },
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
				resolveApproval: async ({ token }) => {
					resolverToken = token;
					return { result: {}, text: "" };
				},
				cancelApproval: async () => approval,
				authorizeApprovalClicker: async () => ({
					allowed: true,
					token: "am_oauth_clicker",
				}),
				claimApproval: async () => approval,
				editActionMessage: async () => {},
				getApproval: async () => approval,
				logger: { error: () => {}, info: () => {}, warn: () => {} },
				postThreadReply: async () => {},
			},
		});

		expect(resolverToken).toBe("am_oauth_clicker");
	});

	test("shows the current state when a claim is rejected", async () => {
		setLeafTestEnv();
		const { handleApprovalActionWithDeps } = await import(
			"../../../src/internal/approvals/surfaces/slack/decide.js"
		);
		const edits: unknown[] = [];
		const approval = {
			decided_by_provider_user_id: "U9",
			env: AppEnv.Sandbox,
			expires_at: Date.now() + 60_000,
			status: "approved",
			tool_name: "attach",
			tool_args: { request: { customer_id: "cus_1", plan_id: "pro" } },
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
				resolveApproval: async () => {
					throw new Error("should not run");
				},
				cancelApproval: async () => undefined,
				claimApproval: async () => undefined,
				editActionMessage: async ({ content }) => {
					edits.push(content);
				},
				getApproval: async () => approval,
				logger: { error: () => {}, info: () => {}, warn: () => {} },
				postThreadReply: async () => {},
			},
		});

		expect(edits).toHaveLength(1);
		expect(JSON.stringify(edits[0])).toContain("✅ Attached **pro**");
		expect(JSON.stringify(edits[0])).toContain("approved by <@U9>");
	});

	test("shows the expired state when a stale pending approval is clicked", async () => {
		setLeafTestEnv();
		const { handleApprovalActionWithDeps } = await import(
			"../../../src/internal/approvals/surfaces/slack/decide.js"
		);
		const edits: unknown[] = [];
		const approval = {
			env: AppEnv.Sandbox,
			expires_at: Date.now() - 60_000,
			status: "pending",
			tool_name: "attach",
			tool_args: { request: { customer_id: "cus_1", plan_id: "pro" } },
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
				resolveApproval: async () => {
					throw new Error("should not run");
				},
				cancelApproval: async () => undefined,
				claimApproval: async () => undefined,
				editActionMessage: async ({ content }) => {
					edits.push(content);
				},
				getApproval: async () => approval,
				logger: { error: () => {}, info: () => {}, warn: () => {} },
				postThreadReply: async () => {},
			},
		});

		expect(edits).toHaveLength(1);
		expect(JSON.stringify(edits[0])).toContain("expired");
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
		expect(result.cancelledApprovals).toEqual([approval]);
		expect(sentEvents).toEqual([
			{
				deny_message:
					"User sent new instructions before approving this action.",
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
