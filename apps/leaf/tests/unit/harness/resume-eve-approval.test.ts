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

const mockLeafModule = ({
	factory,
	specifier,
}: {
	factory: () => Record<string, unknown>;
	specifier: string;
}) => mockModuleWithRestore({ baseUrl: import.meta.url, factory, specifier });

let streamedEvents: EveEvent[] = [];
const postedResponses: {
	optionId: string;
	requestId: string;
	siblingRequestIds?: string[];
}[] = [];
let session: EveSessionRef;
await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/client.js",
	factory: () => ({
		postEveInputResponse: async (input: {
			optionId: string;
			requestId: string;
			siblingRequestIds?: string[];
		}) => {
			postedResponses.push({
				optionId: input.optionId,
				requestId: input.requestId,
				siblingRequestIds: input.siblingRequestIds,
			});
			return { continuationToken: "token_2", sessionId: "eve_session_1" };
		},
		streamEveEvents: async function* () {
			for (const event of streamedEvents) yield event;
		},
	}),
});

await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/repo.js",
	factory: () => ({
		getEveSessionBySessionId: async () => session,
		upsertEveSession: async () => undefined,
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
