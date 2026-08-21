import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv, type ChatApproval } from "@autumn/shared";
import type { EveEvent } from "../../../src/internal/agentRuntime/eve/eveEventSchemas.js";
import type { EveSessionRef } from "../../../src/internal/agentRuntime/eve/types.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

// Stubbed first and left stubbed: `env` parses leaf's whole schema at import and
// `db` opens a Postgres pool, so neither has a real namespace to restore — and
// stubbing them is what makes every module below importable, hence restorable.
mock.module("../../../src/lib/env.js", () => ({ env: {} }));
mock.module("../../../src/lib/db.js", () => ({ db: {} }));
mock.module(
	"../../../src/internal/approvals/repos/chatApprovalStepsRepo.js",
	() => ({
		chatApprovalStepsRepo: {
			insert: async () => undefined,
			list: async () => [],
			setPreview: async () => true,
			setStatus: async () => undefined,
		},
	}),
);

const mockLeafModule = ({
	factory,
	specifier,
}: {
	factory: () => Record<string, unknown>;
	specifier: string;
}) => mockModuleWithRestore({ baseUrl: import.meta.url, factory, specifier });

class MockEveSessionGoneError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EveSessionGoneError";
	}
}
let sessionGone = false;
let streamedEvents: EveEvent[] = [];
let streamedEventsBySession: Record<string, EveEvent[]> = {};
let idleTimeoutSessionIds: string[] = [];
const streamedSessionIds: string[] = [];
class MockEveStreamIdleTimeoutError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EveStreamIdleTimeoutError";
	}
}
const postedResponses: {
	approveSiblings?: boolean;
	optionId: string;
	requestId: string;
	siblingRequestIds?: string[];
}[] = [];
let session: EveSessionRef;
await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/client.js",
	factory: () => ({
		EveSessionGoneError: MockEveSessionGoneError,
		EveStreamIdleTimeoutError: MockEveStreamIdleTimeoutError,
		postEveInputResponse: async (input: {
			approveSiblings?: boolean;
			optionId: string;
			requestId: string;
			siblingRequestIds?: string[];
		}) => {
			if (sessionGone) {
				throw new MockEveSessionGoneError(
					"Eve session is gone (500): target session was not found via continuation token.",
				);
			}
			postedResponses.push({
				approveSiblings: input.approveSiblings,
				optionId: input.optionId,
				requestId: input.requestId,
				siblingRequestIds: input.siblingRequestIds,
			});
			return { continuationToken: "token_2", sessionId: "eve_session_1" };
		},
		streamEveEvents: async function* ({
			session: streamSession,
		}: {
			session: EveSessionRef;
		}) {
			streamedSessionIds.push(streamSession.sessionId);
			const events =
				streamedEventsBySession[streamSession.sessionId] ?? streamedEvents;
			for (const event of events) yield event;
			if (idleTimeoutSessionIds.includes(streamSession.sessionId)) {
				throw new MockEveStreamIdleTimeoutError("Eve stream idle timeout");
			}
		},
	}),
});

const deletedSessionIds: string[] = [];
await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/repo.js",
	factory: () => ({
		deleteEveSession: async ({ sessionId }: { sessionId: string }) => {
			deletedSessionIds.push(sessionId);
		},
		getEveSessionBySessionId: async () => session,
		upsertEveSession: async () => undefined,
	}),
});

const finalized: Array<{ approvalId: string; status: string }> = [];
const released: string[] = [];
await mockLeafModule({
	specifier: "../../../src/internal/approvals/repos/chatApprovalRepo.js",
	factory: () => ({
		chatApprovalRepo: {
			finalize: async ({
				approvalId,
				status,
			}: {
				approvalId: string;
				status: string;
			}) => {
				finalized.push({ approvalId, status });
			},
			release: async ({ approvalId }: { approvalId: string }) => {
				released.push(approvalId);
			},
		},
	}),
});

const loggedEvents: string[] = [];
await mockLeafModule({
	specifier: "../../../src/lib/logger.js",
	factory: () => ({
		logger: {
			error: (_message: string, _error: unknown, data: { event: string }) => {
				loggedEvents.push(data.event);
			},
			info: () => {},
			warn: () => {},
		},
	}),
});

const chainedInserts: { toolName: string }[] = [];
await mockLeafModule({
	specifier: "../../../src/internal/approvals/actions/createChainedApproval.js",
	factory: () => ({
		createChainedApproval: async (input: { chained: { toolName: string } }) => {
			chainedInserts.push({ toolName: input.chained.toolName });
			return `chained_${chainedInserts.length}`;
		},
	}),
});

const { resolveApproval } = await import(
	"../../../src/internal/approvals/actions/resolveApproval.js"
);
const { discardApproval } = await import(
	"../../../src/internal/approvals/actions/discardApproval.js"
);
const { resumeApproval } = await import(
	"../../../src/internal/approvals/actions/resumeApproval.js"
);

const groupedApproval = (toolArgs: Record<string, unknown> = {}) =>
	({
		channel_id: "C1",
		env: AppEnv.Sandbox,
		id: "a_1",
		org_id: "org_1",
		provider: "slack",
		run_id: "eve_session_1",
		tool_args: {
			_eveWithheldWrites: [{ requestId: "req_2", toolName: "autumn__attach" }],
			...toolArgs,
		},
		tool_call_id: "req_1",
		tool_name: "autumn__updateCustomer",
		workspace_id: "T1",
	}) as unknown as ChatApproval;

const approval = (toolArgs: Record<string, unknown> = {}) =>
	({
		channel_id: "C1",
		env: AppEnv.Sandbox,
		id: "a_1",
		org_id: "org_1",
		provider: "slack",
		run_id: "eve_session_1",
		tool_args: toolArgs,
		tool_call_id: "req_1",
		tool_name: "autumn__updateSubscription",
		workspace_id: "T1",
	}) as unknown as ChatApproval;

const EMPTY_TURN: EveEvent[] = [
	{ type: "turn.started" },
	{ type: "turn.completed" },
	{ type: "session.waiting" },
];

describe("resumeApproval", () => {
	beforeEach(() => {
		streamedEvents = EMPTY_TURN;
		streamedEventsBySession = {};
		idleTimeoutSessionIds = [];
		postedResponses.length = 0;
		loggedEvents.length = 0;
		session = {
			env: AppEnv.Sandbox,
			newSession: false,
			sessionId: "eve_session_1",
			state: {
				version: 1,
				continuationToken: "token_1",
				streamIndex: 4,
				status: "waiting",
				lastEventAt: 0,
			},
			threadKey: "sandbox:slack:T1:C1:thread_1",
		};
	});

	test("answers the whole batch the card was parked with", async () => {
		await resumeApproval({
			approval: approval({ _eveSiblingRequestIds: ["req_2", "req_3"] }),
			providerUserId: "U1",
		});

		expect(postedResponses).toEqual([
			{
				approveSiblings: true,
				optionId: "approve",
				requestId: "req_1",
				siblingRequestIds: ["req_2", "req_3"],
			},
		]);
	});

	// A turn that opens and closes without a step, a word, or a park means eve
	// deferred the delivery — the write never ran, so the card must not say done.
	test("fails the approval when the resumed turn did nothing at all", async () => {
		const result = await resumeApproval({
			approval: approval(),
			providerUserId: "U1",
		});

		expect(result).toEqual({
			error: true,
			message:
				"The approved action was not executed — the agent's session is waiting on other pending approvals. Please retry.",
			retryable: true,
		});
		expect(loggedEvents).toEqual(["leaf.eve_approval_not_executed"]);
	});

	test("succeeds when the resumed turn replied", async () => {
		streamedEvents = [
			{ type: "turn.started" },
			{ type: "step.started" },
			{
				message: "Updated the subscription.",
				type: "message.completed",
			},
			{ type: "session.waiting" },
		];

		const result = await resumeApproval({
			approval: approval(),
			providerUserId: "U1",
		});

		expect(result).toMatchObject({ text: "Updated the subscription." });
		expect(loggedEvents).toEqual([]);
	});

	// A turn that only ran tools says nothing, but it did execute the write.
	test("succeeds on a silent turn that still did work", async () => {
		streamedEvents = [
			{ type: "turn.started" },
			{ type: "step.started" },
			{
				result: {
					callId: "c1",
					output: { ok: true },
					toolName: "autumn__updateSubscription",
				},
				status: "completed",
				type: "action.result",
			},
			{ type: "session.waiting" },
		];

		const result = await resumeApproval({
			approval: approval(),
			providerUserId: "U1",
		});

		expect(result).toMatchObject({ text: "" });
		expect(loggedEvents).toEqual([]);
	});

	// The guard is for approvals only: a discard has nothing to execute, so an
	// empty turn after one is the expected outcome, not a failure.
	test("leaves a discard alone when its turn says nothing", async () => {
		const result = await discardApproval({
			approval: approval(),
			providerUserId: "U1",
		});

		expect(result).toMatchObject({ text: "" });
		expect(loggedEvents).toEqual([]);
	});
});

// "Something happened" is not "the write ran": a failed tool result and an
// unrelated tool's result both look identical to a bare activity flag.
describe("resumeApproval verifies the approved write actually ran", () => {
	test("fails the approval when the approved write errored", async () => {
		streamedEvents = [
			{ type: "turn.started" },
			{ type: "step.started" },
			{
				result: {
					callId: "c1",
					output: { error: "Plan not found" },
					toolName: "autumn__updateSubscription",
				},
				status: "error",
				type: "action.result",
			},
			{ type: "session.waiting" },
		];

		const result = await resumeApproval({
			approval: approval(),
			providerUserId: "U1",
		});

		expect(result).toMatchObject({ error: true });
	});

	test("fails the approval when only an unrelated tool ran", async () => {
		streamedEvents = [
			{ type: "turn.started" },
			{ type: "step.started" },
			{
				result: {
					callId: "c9",
					output: { customers: [] },
					toolName: "autumn__listCustomers",
				},
				status: "success",
				type: "action.result",
			},
			{ type: "session.waiting" },
		];

		const result = await resumeApproval({
			approval: approval(),
			providerUserId: "U1",
		});

		expect(result).toMatchObject({ error: true });
	});
});

// One card can carry several writes, so a half-applied group must say which
// step failed rather than reporting a blanket success or failure.
describe("grouped approvals report per-step outcomes", () => {
	test("reports the failing step when a later write errors", async () => {
		streamedEvents = [
			{ type: "turn.started" },
			{ type: "step.started" },
			{
				result: {
					callId: "c1",
					output: { ok: true },
					toolName: "autumn__updateCustomer",
				},
				status: "completed",
				type: "action.result",
			},
			{
				result: {
					callId: "c2",
					output: { error: "Plan not found" },
					toolName: "autumn__attach",
				},
				status: "error",
				type: "action.result",
			},
			{ type: "session.waiting" },
		];

		const result = await resumeApproval({
			approval: groupedApproval(),
			providerUserId: "U1",
		});

		expect(result).toMatchObject({
			error: true,
			steps: [
				{ status: "applied", toolName: "autumn__updateCustomer" },
				{ status: "failed", toolName: "autumn__attach" },
			],
		});
	});

	test("reports every step applied when the whole group succeeds", async () => {
		streamedEvents = [
			{ type: "turn.started" },
			{ type: "step.started" },
			{
				result: {
					callId: "c1",
					output: { ok: true },
					toolName: "autumn__updateCustomer",
				},
				status: "completed",
				type: "action.result",
			},
			{
				result: {
					callId: "c2",
					output: { ok: true },
					toolName: "autumn__attach",
				},
				status: "completed",
				type: "action.result",
			},
			{ type: "session.waiting" },
		];

		const result = await resumeApproval({
			approval: groupedApproval(),
			providerUserId: "U1",
		});

		expect(result).toMatchObject({
			steps: [
				{ status: "applied", toolName: "autumn__updateCustomer" },
				{ status: "applied", toolName: "autumn__attach" },
			],
		});
	});
});

// A failed write comes back with status "completed" and the error buried in
// the MCP result text — treating that as success is how a lost write hid.
describe("resumeApproval detects errors inside a completed MCP result", () => {
	test("marks the step failed when the tool text is an API error", async () => {
		streamedEvents = [
			{ type: "turn.started" },
			{ type: "step.started" },
			{
				result: {
					callId: "c1",
					output: {
						content: [
							{
								type: "text",
								text: JSON.stringify({
									message:
										'Autumn API request failed (400): {"message":"Cannot set proration_behavior to \'none\' when creating a new subscription","code":"invalid_request"}',
								}),
							},
						],
						isError: true,
					},
					toolName: "autumn__updateSubscription",
				},
				status: "completed",
				type: "action.result",
			},
			{ type: "session.waiting" },
		];

		const result = await resumeApproval({
			approval: approval(),
			providerUserId: "U1",
		});

		expect(result).toMatchObject({ error: true });
	});
});

// The model may retry a write that errored; the successful retry must win.
describe("a retried write that succeeds counts as applied", () => {
	test("later success overrides an earlier failure for the same step", async () => {
		const failed = {
			result: {
				callId: "c1",
				output: {
					content: [
						{
							type: "text",
							text: '{"message":"Autumn API request failed (400): bad params","code":"invalid_request"}',
						},
					],
					isError: true,
				},
				toolName: "autumn__updateSubscription",
			},
			status: "completed" as const,
			type: "action.result" as const,
		};
		const retried = {
			result: {
				callId: "c2",
				output: { content: [{ type: "text", text: '{"ok":true}' }] },
				toolName: "autumn__updateSubscription",
			},
			status: "completed" as const,
			type: "action.result" as const,
		};
		streamedEvents = [
			{ type: "turn.started" },
			{ type: "step.started" },
			failed,
			retried,
			{ type: "session.waiting" },
		];

		const result = await resumeApproval({
			approval: approval(),
			providerUserId: "U1",
		});

		expect(result).not.toMatchObject({ error: true });
		expect(result).toMatchObject({
			steps: [{ status: "applied", toolName: "autumn__updateSubscription" }],
		});
	});
});

// A fan-out is N calls of the same tool. Each result must land on its OWN step
// by callId — matching by name alone lets a middle failure be overwritten by
// the next success and reported as a clean run.
describe("same-tool groups attribute each result to its own step", () => {
	const fanOutApproval = () =>
		({
			channel_id: "C1",
			env: AppEnv.Sandbox,
			id: "a_1",
			org_id: "org_1",
			provider: "slack",
			run_id: "eve_session_1",
			tool_args: {
				_eveWithheldWrites: [
					{ requestId: "req_2", toolName: "autumn__attach" },
					{ requestId: "req_3", toolName: "autumn__attach" },
				],
			},
			tool_call_id: "req_1",
			tool_name: "autumn__attach",
			workspace_id: "T1",
		}) as unknown as ChatApproval;

	const resultFor = (callId: string, failed: boolean) => ({
		result: {
			callId,
			output: failed
				? {
						content: [
							{
								type: "text",
								text: '{"message":"Autumn API request failed (400): boom","code":"invalid_request"}',
							},
						],
						isError: true,
					}
				: { content: [{ type: "text", text: '{"ok":true}' }] },
			toolName: "autumn__attach",
		},
		status: "completed" as const,
		type: "action.result" as const,
	});

	test("a middle failure is not masked by a later success", async () => {
		streamedEvents = [
			{ type: "turn.started" },
			{
				actions: [
					{ callId: "cA", toolName: "autumn__attach" },
					{ callId: "cB", toolName: "autumn__attach" },
					{ callId: "cC", toolName: "autumn__attach" },
				],
				type: "actions.requested",
			},
			resultFor("cA", false),
			resultFor("cB", true),
			resultFor("cC", false),
			{ type: "session.waiting" },
		];

		const result = await resumeApproval({
			approval: fanOutApproval(),
			providerUserId: "U1",
		});

		expect(result).toMatchObject({
			error: true,
			steps: [
				{ status: "applied" },
				{ status: "failed" },
				{ status: "applied" },
			],
		});
	});
});

// Only a surface that renders the whole group may approve the whole group. The
// dashboard shows the primary write alone, so it must not silently apply the
// siblings it never displayed.
describe("grouped approval is surface-scoped", () => {
	const groupedFor = (provider: string) =>
		({
			channel_id: "C1",
			env: AppEnv.Sandbox,
			id: "a_1",
			org_id: "org_1",
			provider,
			run_id: "eve_session_1",
			tool_args: {
				_eveSiblingRequestIds: ["req_2"],
				_eveWithheldWrites: [
					{ requestId: "req_2", toolName: "autumn__attach" },
				],
			},
			tool_call_id: "req_1",
			tool_name: "autumn__updateCustomer",
			workspace_id: "T1",
		}) as unknown as ChatApproval;

	test("slack approves every write in the group", async () => {
		streamedEvents = [
			{ type: "turn.started" },
			{ type: "step.started" },
			{
				result: {
					callId: "c1",
					output: { ok: true },
					toolName: "autumn__updateCustomer",
				},
				status: "completed",
				type: "action.result",
			},
			{ type: "session.waiting" },
		];
		await resumeApproval({
			approval: groupedFor("slack"),
			providerUserId: "U1",
		});
		expect(postedResponses.at(-1)).toMatchObject({
			approveSiblings: true,
			siblingRequestIds: ["req_2"],
		});
	});

	test("web denies siblings it did not render", async () => {
		streamedEvents = [
			{ type: "turn.started" },
			{ type: "step.started" },
			{
				result: {
					callId: "c1",
					output: { ok: true },
					toolName: "autumn__updateCustomer",
				},
				status: "completed",
				type: "action.result",
			},
			{ type: "session.waiting" },
		];
		await resumeApproval({ approval: groupedFor("web"), providerUserId: "U1" });
		expect(postedResponses.at(-1)?.approveSiblings).not.toBe(true);
	});
});

// Internal Autumn threads run on the `slack_admin:<client>` provider and render
// the same grouped card, so approving it must approve every write it showed.
describe("grouped approvals on internal Slack threads", () => {
	beforeEach(() => {
		streamedEvents = EMPTY_TURN;
		postedResponses.length = 0;
	});

	test("approves the siblings for a slack_admin provider", async () => {
		await resumeApproval({
			approval: {
				...approval({ _eveSiblingRequestIds: ["req_2"] }),
				provider: "slack_admin:7771931436213.11262719726241",
			} as ChatApproval,
			providerUserId: "U1",
		});

		expect(postedResponses).toEqual([
			{
				approveSiblings: true,
				optionId: "approve",
				requestId: "req_1",
				siblingRequestIds: ["req_2"],
			},
		]);
	});

	test("withholds the siblings for the dashboard, which shows one write", async () => {
		await resumeApproval({
			approval: {
				...approval({ _eveSiblingRequestIds: ["req_2"] }),
				provider: "web",
			} as ChatApproval,
			providerUserId: "U1",
		});

		expect(postedResponses[0]?.approveSiblings).toBe(false);
	});
});

// A sibling that eve rejected gets re-issued by the model as its own step; the
// card for that re-park must still reach the surface even though the approval
// itself is reported failed — otherwise the session waits on it in silence.
describe("grouped approvals that fail a step and park again", () => {
	beforeEach(() => {
		postedResponses.length = 0;
		chainedInserts.length = 0;
	});

	test("returns the chained approval alongside the failure", async () => {
		streamedEvents = [
			{ type: "turn.started" },
			{ type: "step.started" },
			{
				result: {
					callId: "c2",
					output: {
						approval: { requestId: "req_2", status: "denied" },
						code: "TOOL_EXECUTION_DENIED",
						message: "Tool execution was denied.",
					},
					toolName: "autumn__attach",
				},
				status: "rejected",
				type: "action.result",
			},
			{
				result: {
					callId: "c1",
					output: { ok: true },
					toolName: "autumn__updateCustomer",
				},
				status: "completed",
				type: "action.result",
			},
			{
				requests: [
					{
						action: {
							callId: "c3",
							input: { request: { customer_id: "cus_1", plan_id: "pro" } },
							toolName: "autumn__attach",
						},
						options: [
							{ id: "approve", label: "Approve" },
							{ id: "deny", label: "Deny" },
						],
						requestId: "req_3",
					},
				],
				type: "input.requested",
			},
		];

		const result = await resumeApproval({
			approval: groupedApproval(),
			providerUserId: "U1",
		});

		expect(chainedInserts).toEqual([{ toolName: "autumn__attach" }]);
		expect(result).toMatchObject({
			chainedApprovalId: "chained_1",
			error: true,
			steps: [
				{ status: "applied", toolName: "autumn__updateCustomer" },
				{ status: "failed", toolName: "autumn__attach" },
			],
		});
	});
});

// Eve has lost the session (its transcript broke terminally). Returning the card
// to pending would block the thread behind a card nothing can ever run.
describe("resolveApproval when eve has lost the session", () => {
	beforeEach(() => {
		sessionGone = true;
		finalized.length = 0;
		released.length = 0;
		deletedSessionIds.length = 0;
	});

	test("finalizes the card as failed, drops the session, and does not retry", async () => {
		const result = await resolveApproval({
			approval: approval(),
			providerUserId: "U1",
		});

		expect(result).toMatchObject({ error: true, retryable: false });
		expect(finalized).toEqual([{ approvalId: "a_1", status: "failed" }]);
		expect(released).toEqual([]);
		expect(deletedSessionIds).toEqual(["eve_session_1"]);
		sessionGone = false;
	});
});

// A write delegated to a subagent executes on the child session, so the
// parent's resumed stream never carries its result — proof must come from
// replaying the child stream named on the card.
describe("delegated writes are verified on the child stream", () => {
	const delegatedApproval = () =>
		({
			channel_id: "C1",
			env: AppEnv.Sandbox,
			id: "a_1",
			org_id: "org_1",
			provider: "slack",
			run_id: "eve_session_1",
			tool_args: { _eveChildSessionIds: ["child_1"] },
			tool_call_id: "req_1",
			tool_name: "autumn__attach",
			workspace_id: "T1",
		}) as unknown as ChatApproval;

	// The post-approval continuation has no turn.started: the proxy epilogue
	// already closed the turn, so activity alone must unlock the terminal break.
	const parentContinuation: EveEvent[] = [
		{ type: "subagent.completed", subagentName: "billing" },
		{
			finishReason: "stop",
			message: "Attached the plan.",
			type: "message.completed",
		},
		{ type: "session.waiting" },
	];

	const childResult = (failed: boolean): EveEvent[] => [
		{
			actions: [{ callId: "cc1", toolName: "autumn__attach" }],
			type: "actions.requested",
		},
		{
			result: {
				callId: "cc1",
				output: failed
					? {
							content: [
								{
									type: "text",
									text: '{"message":"Autumn API request failed (400): boom","code":"invalid_request"}',
								},
							],
							isError: true,
						}
					: { content: [{ type: "text", text: '{"ok":true}' }] },
				toolName: "autumn__attach",
			},
			status: "completed",
			type: "action.result",
		},
		{ type: "session.completed" },
	];

	beforeEach(() => {
		streamedEvents = parentContinuation;
		streamedEventsBySession = {};
		idleTimeoutSessionIds = [];
		streamedSessionIds.length = 0;
		postedResponses.length = 0;
		loggedEvents.length = 0;
		session = {
			env: AppEnv.Sandbox,
			newSession: false,
			sessionId: "eve_session_1",
			state: {
				version: 1,
				continuationToken: "token_1",
				streamIndex: 4,
				status: "waiting",
				lastEventAt: 0,
			},
			threadKey: "sandbox:slack:T1:C1:thread_1",
		};
	});

	test("a child-stream success proves the step and keeps the reply", async () => {
		streamedEventsBySession = { child_1: childResult(false) };

		const result = await resumeApproval({
			approval: delegatedApproval(),
			providerUserId: "U1",
		});

		expect(streamedSessionIds).toEqual(["eve_session_1", "child_1"]);
		expect(result).not.toMatchObject({ error: true });
		expect(result).toMatchObject({
			steps: [{ status: "applied", toolName: "autumn__attach" }],
			text: "Attached the plan.",
		});
	});

	test("a child-stream failure fails the approval", async () => {
		streamedEventsBySession = { child_1: childResult(true) };

		const result = await resumeApproval({
			approval: delegatedApproval(),
			providerUserId: "U1",
		});

		expect(result).toMatchObject({
			error: true,
			steps: [{ status: "failed", toolName: "autumn__attach" }],
		});
	});

	test("a child replay that idles out still keeps its results", async () => {
		streamedEventsBySession = {
			child_1: childResult(false).filter(
				(event) => event.type !== "session.completed",
			),
		};
		idleTimeoutSessionIds = ["child_1"];

		const result = await resumeApproval({
			approval: delegatedApproval(),
			providerUserId: "U1",
		});

		expect(result).toMatchObject({
			steps: [{ status: "applied", toolName: "autumn__attach" }],
		});
	});

	// A parent reply alone still counts as run (results can precede the
	// stream); only a fully silent turn plus a silent child is unproven.
	test("a silent child and a silent parent read as not executed", async () => {
		streamedEvents = [
			{ subagentName: "billing", type: "subagent.completed" },
			{ type: "session.waiting" },
		];
		streamedEventsBySession = { child_1: [{ type: "session.completed" }] };

		const result = await resumeApproval({
			approval: delegatedApproval(),
			providerUserId: "U1",
		});

		expect(result).toMatchObject({ error: true, retryable: true });
		expect(loggedEvents).toEqual(["leaf.eve_approval_not_executed"]);
	});
});
