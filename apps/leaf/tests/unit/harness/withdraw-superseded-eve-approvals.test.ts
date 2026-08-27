import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AutumnLogger } from "@autumn/logging";
import { AppEnv, type ChatApproval } from "@autumn/shared";
import type { AgentThreadRef } from "../../../src/internal/agentRuntime/domain/agentTurnContext.js";
import type { EveSessionRef } from "../../../src/internal/agentRuntime/eve/types.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

// Stubbed first and left stubbed: `env` parses leaf's whole schema at import and
// `db` opens a Postgres pool, so neither has a real namespace to restore — and
// stubbing them is what makes every module below importable, hence restorable.
mock.module("../../../src/lib/env.js", () => ({ env: {} }));
// denyApprovalParkAndDrain lists step rows; an empty result set suffices.
const emptySelect = () => ({
	from: () => ({ where: () => ({ orderBy: async () => [] }) }),
});
mock.module("../../../src/lib/db.js", () => ({
	db: { select: emptySelect },
}));

const mockLeafModule = ({
	factory,
	specifier,
}: {
	factory: () => Record<string, unknown>;
	specifier: string;
}) => mockModuleWithRestore({ baseUrl: import.meta.url, factory, specifier });

let pendingApprovals: ChatApproval[] = [];
const cancelledApprovalIds: string[] = [];
const rehomedRuns: Array<{
	approvalId: string;
	fromRunId: string;
	toRunId: string;
}> = [];
await mockLeafModule({
	specifier: "../../../src/internal/approvals/repos/chatApprovalRepo.js",
	factory: () => ({
		chatApprovalRepo: {
			cancel: async ({ approvalId }: { approvalId: string }) => {
				cancelledApprovalIds.push(approvalId);
				return pendingApprovals.find((approval) => approval.id === approvalId);
			},
			listPendingForRun: async () => pendingApprovals,
			moveToRun: async (move: {
				approvalId: string;
				fromRunId: string;
				toRunId: string;
			}) => {
				rehomedRuns.push({
					approvalId: move.approvalId,
					fromRunId: move.fromRunId,
					toRunId: move.toRunId,
				});
			},
		},
	}),
});

class MockEveSessionGoneError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EveSessionGoneError";
	}
}
const failingRequestIds = new Set<string>();
const goneRequestIds = new Set<string>();
const postedNotes: string[] = [];
const postedRequestIds: string[] = [];
await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/client.js",
	factory: () => ({
		EveSessionGoneError: MockEveSessionGoneError,
		postEveInputResponse: async ({
			note,
			requestId,
		}: {
			note: string;
			requestId: string;
		}) => {
			postedNotes.push(note);
			postedRequestIds.push(requestId);
			if (failingRequestIds.has(requestId)) {
				throw new Error("Eve session request failed: 503");
			}
			if (goneRequestIds.has(requestId)) {
				throw new MockEveSessionGoneError(
					"Eve session is gone (500): Cannot deliver inputResponses — the target session was not found via continuation token.",
				);
			}
			// Eve re-homes on every post here, so a persisted session id proves the
			// caller saved the ref rather than dropping it.
			return {
				continuationToken: `token_${requestId}`,
				sessionId: `eve_rehomed_${requestId}`,
			};
		},
	}),
});

const drainedSessionIds: string[] = [];
await mockLeafModule({
	specifier:
		"../../../src/internal/agentRuntime/actions/submitAgentInput/drainParkedAgentTurn.js",
	factory: () => ({
		drainParkedAgentTurn: async ({ session }: { session: EveSessionRef }) => {
			drainedSessionIds.push(session.sessionId);
		},
	}),
});

const savedSessionIds: string[] = [];
await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/sessionState.js",
	factory: () => ({
		saveEveSessionState: async ({ session }: { session: EveSessionRef }) => {
			savedSessionIds.push(session.sessionId);
		},
	}),
});

const { withdrawSupersededApprovals } = await import(
	"../../../src/internal/approvals/actions/withdrawSupersededApprovals.js"
);

const approval = (id: string, toolCallId?: string) =>
	({
		id,
		run_id: "eve_session_1",
		tool_args: {},
		tool_call_id: toolCallId,
		tool_name: "attach",
	}) as unknown as ChatApproval;

const thread = {
	channelId: "C1",
	provider: "slack",
	threadId: "thread_1",
	workspaceId: "T1",
} as AgentThreadRef;

const logger = { info: () => {}, warn: () => {} } as unknown as AutumnLogger;

let session: EveSessionRef;
let supersededBatches: ChatApproval[][];

const withdraw = () =>
	withdrawSupersededApprovals({
		logger,
		onApprovalsSuperseded: async (approvals) => {
			supersededBatches.push(approvals);
		},
		orgId: "org_1",
		providerUserId: "U1",
		session,
		thread,
	});

describe("withdrawSupersededApprovals", () => {
	beforeEach(() => {
		pendingApprovals = [];
		failingRequestIds.clear();
		goneRequestIds.clear();
		cancelledApprovalIds.length = 0;
		postedRequestIds.length = 0;
		postedNotes.length = 0;
		drainedSessionIds.length = 0;
		savedSessionIds.length = 0;
		rehomedRuns.length = 0;
		supersededBatches = [];
		session = {
			env: AppEnv.Sandbox,
			newSession: false,
			sessionId: "eve_session_1",
			state: {
				continuationToken: "token_1",
				streamIndex: 7,
				pendingRequests: [],
			},
			threadKey: "sandbox:slack:T1:C1:thread_1",
		};
	});

	test("collects deny responses and cancels cards without touching eve", async () => {
		pendingApprovals = [approval("a_1", "tc_1"), approval("a_2", "tc_2")];

		const { withdrawal } = await withdraw();

		expect(withdrawal?.inputResponses).toEqual([
			{ optionId: "deny", requestId: "tc_1" },
			{ optionId: "deny", requestId: "tc_2" },
		]);
		expect(withdrawal?.note.length ?? 0).toBeGreaterThan(0);
		expect(cancelledApprovalIds).toEqual(["a_1", "a_2"]);
		expect(supersededBatches).toHaveLength(1);
		expect(postedRequestIds).toHaveLength(0);
		expect(drainedSessionIds).toHaveLength(0);
	});

	test("sibling parks are denied in the same bundle", async () => {
		const withSiblings = approval("a_1", "tc_1");
		(withSiblings.tool_args as Record<string, unknown>)._eveSiblingRequestIds =
			["tc_1b", "tc_1c"];

		pendingApprovals = [withSiblings];

		const { withdrawal } = await withdraw();

		expect(withdrawal?.inputResponses).toEqual([
			{ optionId: "deny", requestId: "tc_1" },
			{ optionId: "deny", requestId: "tc_1b" },
			{ optionId: "deny", requestId: "tc_1c" },
		]);
	});

	test("an approval with no park cancels without a deny response", async () => {
		pendingApprovals = [approval("a_1", undefined)];

		const { withdrawal } = await withdraw();

		expect(withdrawal).toBeUndefined();
		expect(cancelledApprovalIds).toEqual(["a_1"]);
		expect(supersededBatches).toHaveLength(1);
	});

	test("a foreign-run approval is rehomed and blocks the turn", async () => {
		const foreign = approval("a_2", "tc_2");
		(foreign as unknown as { run_id: string }).run_id = "eve_session_OLD";
		pendingApprovals = [approval("a_1", "tc_1"), foreign];

		await expect(withdraw()).rejects.toThrow();

		expect(cancelledApprovalIds).toEqual(["a_1"]);
		expect(rehomedRuns).toEqual([
			{
				approvalId: "a_2",
				fromRunId: "eve_session_OLD",
				toRunId: "eve_session_1",
			},
		]);
		expect(postedRequestIds).toHaveLength(0);
	});
});
