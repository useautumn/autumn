import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv, type ChatApproval } from "@autumn/shared";
import type { EveEvent } from "../../../src/harness/eve/client.js";
import type { EveSessionRef } from "../../../src/harness/eve/types.js";
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
	responses: { optionId: string; requestId: string }[];
	siblingRequestIds?: string[];
}[] = [];
await mockLeafModule({
	specifier: "../../../src/harness/eve/client.js",
	factory: () => ({
		postEveInputResponses: async (input: {
			responses: { optionId: string; requestId: string }[];
			siblingRequestIds?: string[];
		}) => {
			postedResponses.push({
				responses: input.responses,
				siblingRequestIds: input.siblingRequestIds,
			});
			return { continuationToken: "token_2", sessionId: "eve_session_1" };
		},
		streamEveEvents: async function* () {
			for (const event of streamedEvents) yield event;
		},
	}),
});

let session: EveSessionRef;
await mockLeafModule({
	specifier: "../../../src/harness/eve/repo.js",
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

const { denyEveApprovalGroup, resumeEveApprovalGroup } = await import(
	"../../../src/harness/eve/approval.js"
);

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

describe("resumeEveApprovalGroup", () => {
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
		await resumeEveApprovalGroup({
			approvals: [approval({ _eveSiblingRequestIds: ["req_2", "req_3"] })],
			providerUserId: "U1",
		});

		expect(postedResponses).toEqual([
			{
				responses: [{ optionId: "approve", requestId: "req_1" }],
				siblingRequestIds: ["req_2", "req_3"],
			},
		]);
	});

	// A turn that opens and closes without a step, a word, or a park means eve
	// deferred the delivery — the write never ran, so the card must not say done.
	test("fails the approval when the resumed turn did nothing at all", async () => {
		const result = await resumeEveApprovalGroup({
			approvals: [approval()],
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
				data: { message: "Updated the subscription." },
				type: "message.completed",
			},
			{ type: "session.waiting" },
		];

		const result = await resumeEveApprovalGroup({
			approvals: [approval()],
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
			{ data: { result: { callId: "c1" } }, type: "action.result" },
			{ type: "session.waiting" },
		];

		const result = await resumeEveApprovalGroup({
			approvals: [approval()],
			providerUserId: "U1",
		});

		expect(result).toMatchObject({ text: "" });
		expect(loggedEvents).toEqual([]);
	});

	// The guard is for approvals only: a discard has nothing to execute, so an
	// empty turn after one is the expected outcome, not a failure.
	test("leaves a discard alone when its turn says nothing", async () => {
		const result = await denyEveApprovalGroup({
			approvals: [approval()],
			providerUserId: "U1",
		});

		expect(result).toMatchObject({ text: "" });
		expect(loggedEvents).toEqual([]);
	});
});
