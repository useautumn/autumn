import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AutumnLogger } from "@autumn/logging";
import { AppEnv, type ChatApproval } from "@autumn/shared";
import type { ThreadRef } from "../../../src/agent/runMessage/types.js";
import type {
	EveAuthContext,
	EveSessionRef,
} from "../../../src/internal/agentRuntime/eve/types.js";
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
}) =>
	mockModuleWithRestore({ baseUrl: import.meta.url, factory, specifier });

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

const failingRequestIds = new Set<string>();
const postedRequestIds: string[] = [];
await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/client.js",
	factory: () => ({
		postEveInputResponse: async ({ requestId }: { requestId: string }) => {
			postedRequestIds.push(requestId);
			if (failingRequestIds.has(requestId)) {
				throw new Error("Eve session request failed: 503");
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
	specifier: "../../../src/internal/agentRuntime/eve/parkedTurn.js",
	factory: () => ({
		denyOptionFromApproval: () => "deny",
		drainParkedEveTurn: async ({ session }: { session: EveSessionRef }) => {
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

const { withdrawSupersededEveApprovals } = await import(
	"../../../src/internal/agentRuntime/eve/supersededApprovals.js"
);

const approval = (id: string, toolCallId?: string) =>
	({
		id,
		run_id: "eve_session_1",
		tool_args: {},
		tool_call_id: toolCallId,
	}) as unknown as ChatApproval;

const auth = {
	appEnv: AppEnv.Sandbox,
	channelId: "C1",
	orgId: "org_1",
	provider: "slack",
	providerUserId: "U1",
	threadId: "thread_1",
	workspaceId: "T1",
} satisfies EveAuthContext;

const thread = {
	channelId: "C1",
	provider: "slack",
	threadId: "thread_1",
	workspaceId: "T1",
} as ThreadRef;

const logger = { warn: () => {} } as unknown as AutumnLogger;

let session: EveSessionRef;
let supersededBatches: ChatApproval[][];

const withdraw = () =>
	withdrawSupersededEveApprovals({
		auth,
		logger,
		onApprovalsSuperseded: async (approvals) => {
			supersededBatches.push(approvals);
		},
		orgId: "org_1",
		providerUserId: "U1",
		session,
		thread,
	});

describe("withdrawSupersededEveApprovals", () => {
	beforeEach(() => {
		pendingApprovals = [];
		failingRequestIds.clear();
		cancelledApprovalIds.length = 0;
		postedRequestIds.length = 0;
		drainedSessionIds.length = 0;
		savedSessionIds.length = 0;
		rehomedRuns.length = 0;
		supersededBatches = [];
		session = {
			env: AppEnv.Sandbox,
			newSession: false,
			sessionId: "eve_session_1",
			state: {
				version: 1,
				continuationToken: "token_1",
				streamIndex: 7,
				status: "waiting",
				lastEventAt: 0,
			},
			threadKey: "sandbox:slack:T1:C1:thread_1",
		};
	});

	test("withdraws each card in eve before cancelling it locally", async () => {
		pendingApprovals = [approval("a_1", "tc_1"), approval("a_2", "tc_2")];

		await withdraw();

		expect(postedRequestIds).toEqual(["tc_1", "tc_2"]);
		expect(drainedSessionIds).toEqual(["eve_rehomed_tc_1", "eve_rehomed_tc_2"]);
		expect(cancelledApprovalIds).toEqual(["a_1", "a_2"]);
		expect(supersededBatches).toEqual([pendingApprovals]);
	});

	test("cancels a card eve never registered without posting to eve", async () => {
		pendingApprovals = [approval("a_1")];

		await withdraw();

		expect(postedRequestIds).toEqual([]);
		expect(cancelledApprovalIds).toEqual(["a_1"]);
	});

	test("a failed withdrawal aborts the turn instead of replying empty", async () => {
		pendingApprovals = [approval("a_1", "tc_1")];
		failingRequestIds.add("tc_1");

		await expect(withdraw()).rejects.toThrow(/open approval card/);
	});

	test("a failed withdrawal leaves the card decidable", async () => {
		pendingApprovals = [approval("a_1", "tc_1")];
		failingRequestIds.add("tc_1");

		await withdraw().catch(() => {});

		expect(cancelledApprovalIds).toEqual([]);
		expect(supersededBatches).toEqual([]);
	});

	test("reports the cards it did cancel before aborting", async () => {
		pendingApprovals = [approval("a_1", "tc_1"), approval("a_2", "tc_2")];
		failingRequestIds.add("tc_2");

		await withdraw().catch(() => {});

		expect(cancelledApprovalIds).toEqual(["a_1"]);
		expect(supersededBatches).toEqual([[pendingApprovals[0] as ChatApproval]]);
	});

	test("persists the re-homed session before aborting", async () => {
		pendingApprovals = [approval("a_1", "tc_1"), approval("a_2", "tc_2")];
		failingRequestIds.add("tc_2");

		await withdraw().catch(() => {});

		expect(savedSessionIds).toEqual(["eve_rehomed_tc_1"]);
	});

	test("moves the card it could not withdraw onto the re-homed run", async () => {
		pendingApprovals = [approval("a_1", "tc_1"), approval("a_2", "tc_2")];
		failingRequestIds.add("tc_2");

		await withdraw().catch(() => {});

		// Guarded on the run it was listed under, so a concurrent re-home wins.
		expect(rehomedRuns).toEqual([
			{
				approvalId: "a_2",
				fromRunId: "eve_session_1",
				toRunId: "eve_rehomed_tc_1",
			},
		]);
	});

	test("leaves the card alone when the run was never re-homed", async () => {
		pendingApprovals = [approval("a_1", "tc_1")];
		failingRequestIds.add("tc_1");

		await withdraw().catch(() => {});

		expect(rehomedRuns).toEqual([]);
	});

	test("does nothing when the thread has no pending cards", async () => {
		await withdraw();

		expect(postedRequestIds).toEqual([]);
		expect(cancelledApprovalIds).toEqual([]);
		expect(supersededBatches).toEqual([]);
	});
});
