/**
 * Replications of the 24 Aug production incidents, driven through leaf's real
 * prepare → withdraw → start → consume code against a fake eve that encodes
 * eve's confirmed contract:
 *  - a message posted over an unanswered gated park is silently DEFERRED — the
 *    run emits nothing, the stream only ever disconnects (the 12s reaper);
 *  - a message posted on a dead delivery hook silently re-homes to a new run;
 *  - a denied child rebuilds and re-parks.
 * Each scenario asserts the outcome the user should have seen.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv, type ChatApproval } from "@autumn/shared";
import type { EveEvent } from "../../../src/internal/agentRuntime/eve/eveEventSchemas.js";
import type { EveSessionRef } from "../../../src/internal/agentRuntime/eve/types.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

mock.module("../../../src/lib/env.js", () => ({ env: {} }));
mock.module("../../../src/lib/db.js", () => ({ db: {} }));

const mockLeafModule = ({
	factory,
	specifier,
}: {
	factory: () => Record<string, unknown>;
	specifier: string;
}) => mockModuleWithRestore({ baseUrl: import.meta.url, factory, specifier });

class MockEveStreamDisconnectedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EveStreamDisconnectedError";
	}
}
class MockEveStreamIdleTimeoutError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EveStreamIdleTimeoutError";
	}
}
class MockEveSessionGoneError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EveSessionGoneError";
	}
}
class MockEveSessionDeadError extends Error {
	constructor(sessionId: string) {
		super(`Eve session ${sessionId} is dead`);
		this.name = "EveSessionDeadError";
	}
}

// ---------------------------------------------------------------- fake eve

type Park = { kind: "gated"; requestId: string };
type FakeSession = {
	deferredMessages: number;
	events: EveEvent[];
	id: string;
	parks: Park[];
	rebuildsLeft: number;
	token: string;
};
const fakeSessions = new Map<string, FakeSession>();
const deadTokens = new Set<string>();
let nextSession = 0;
let rebuildsAfterDeny = 0;

const gatedPark = (requestId: string): EveEvent =>
	({
		requests: [
			{
				action: { input: {}, toolName: "autumn__attach" },
				options: [
					{ id: "approve", label: "Approve" },
					{ id: "deny", label: "Deny" },
				],
				requestId,
			},
		],
		type: "input.requested",
	}) as unknown as EveEvent;

const replyEvents = (text: string): EveEvent[] =>
	[
		{ type: "turn.started" },
		{ message: text, type: "message.completed" },
		{ type: "session.waiting" },
	] as EveEvent[];

const createFakeSession = () => {
	nextSession += 1;
	const session: FakeSession = {
		deferredMessages: 0,
		events: [],
		id: `wrun_fake_${nextSession}`,
		parks: [],
		rebuildsLeft: rebuildsAfterDeny,
		token: `token_${nextSession}`,
	};
	fakeSessions.set(session.id, session);
	return session;
};

const parkOn = (session: FakeSession, requestId: string) => {
	session.parks = [{ kind: "gated", requestId }];
	session.events.push(
		{ type: "turn.started" } as EveEvent,
		gatedPark(requestId),
	);
};

const deliver = ({
	inputResponses,
	message,
	session,
}: {
	inputResponses?: Array<{ optionId: string; requestId: string }>;
	message?: unknown;
	session: FakeSession;
}) => {
	const answered = new Set((inputResponses ?? []).map((r) => r.requestId));
	const unanswered = session.parks.filter(
		(park) => !answered.has(park.requestId),
	);
	if (unanswered.length > 0) {
		// eve: deferred step input, zero events.
		session.deferredMessages += 1;
		return;
	}
	session.parks = [];
	if (session.rebuildsLeft > 0 && (inputResponses?.length ?? 0) > 0) {
		session.rebuildsLeft -= 1;
		parkOn(session, `tc_rebuilt_${session.rebuildsLeft}`);
		return;
	}
	session.events.push(...replyEvents(`answered: ${String(message ?? "")}`));
};

const posts: Array<{
	inputResponses?: unknown;
	kind: "message" | "input";
	message?: unknown;
}> = [];

await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/client.js",
	factory: () => ({
		EveSessionDeadError: MockEveSessionDeadError,
		EveSessionGoneError: MockEveSessionGoneError,
		EveStreamDisconnectedError: MockEveStreamDisconnectedError,
		EveStreamIdleTimeoutError: MockEveStreamIdleTimeoutError,
		fastForwardEveStreamIndex: async () => undefined,
		resyncEveStreamIndex: async () => undefined,
		postEveMessage: async ({
			inputResponses,
			message,
			session,
		}: {
			inputResponses?: Array<{ optionId: string; requestId: string }>;
			message?: unknown;
			session?: EveSessionRef;
		}) => {
			posts.push({ inputResponses, kind: "message", message });
			if (!session) {
				const created = createFakeSession();
				created.events.push(...replyEvents("hello"));
				return { continuationToken: created.token, sessionId: created.id };
			}
			if (deadTokens.has(session.state.continuationToken)) {
				// eve: falls back to a brand-new run, no error.
				const rehomed = createFakeSession();
				rehomed.events.push(...replyEvents("rehomed"));
				return { continuationToken: rehomed.token, sessionId: rehomed.id };
			}
			const fake = fakeSessions.get(session.sessionId);
			if (!fake) throw new MockEveSessionGoneError("session was not found");
			deliver({ inputResponses, message, session: fake });
			return { continuationToken: fake.token, sessionId: fake.id };
		},
		postEveInputResponse: async ({
			optionId,
			requestId,
			session,
		}: {
			optionId: string;
			requestId: string;
			session: EveSessionRef;
		}) => {
			posts.push({ inputResponses: [{ optionId, requestId }], kind: "input" });
			const fake = fakeSessions.get(session.sessionId);
			if (!fake) throw new MockEveSessionGoneError("session was not found");
			deliver({ inputResponses: [{ optionId, requestId }], session: fake });
			return { continuationToken: fake.token, sessionId: fake.id };
		},
		streamEveEvents: async function* ({ session }: { session: EveSessionRef }) {
			const fake = fakeSessions.get(session.sessionId);
			if (!fake) throw new MockEveSessionGoneError("session was not found");
			const pending = fake.events.slice(session.state.streamIndex);
			for (const event of pending) yield event;
			if (pending.length === 0) {
				// Nothing to send: the idle reaper cuts the socket.
				throw new MockEveStreamDisconnectedError("socket closed");
			}
		},
	}),
});

let tokenAlive: boolean | undefined;
const cancelledRuns: string[] = [];
await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/world/sessionRun.js",
	factory: () => ({
		cancelSessionRun: async (sessionId: string) => {
			cancelledRuns.push(sessionId);
			return true;
		},
		isContinuationTokenAlive: async () => tokenAlive,
	}),
});
await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/world/workflowWorld.js",
	factory: () => ({ hasWorkflowWorld: () => false }),
});
await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/world/sessionStream.js",
	factory: () => ({ sessionEventCount: async () => undefined }),
});

let storedSession: EveSessionRef | undefined;
const deletedSessions: string[] = [];
await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/repo.js",
	factory: () => ({
		deleteEveSession: async ({ sessionId }: { sessionId: string }) => {
			deletedSessions.push(sessionId);
			if (storedSession?.sessionId === sessionId) storedSession = undefined;
		},
		getEveSession: async () => storedSession,
		getEveSessionBySessionId: async () => storedSession,
		upsertEveSession: async ({
			sessionId,
			state,
			threadKey,
		}: {
			sessionId: string;
			state: EveSessionRef["state"];
			threadKey: string;
		}) => {
			storedSession = {
				env: AppEnv.Sandbox,
				newSession: false,
				sessionId,
				state: {
					...state,
					pendingRequests: [...(state.pendingRequests ?? [])],
				},
				threadKey,
			};
		},
	}),
});

let pendingApprovals: ChatApproval[] = [];
const cancelledApprovals: string[] = [];
await mockLeafModule({
	specifier: "../../../src/internal/approvals/repos/chatApprovalRepo.js",
	factory: () => ({
		chatApprovalRepo: {
			cancel: async ({ approvalId }: { approvalId: string }) => {
				cancelledApprovals.push(approvalId);
				const row = pendingApprovals.find((a) => a.id === approvalId);
				pendingApprovals = pendingApprovals.filter((a) => a.id !== approvalId);
				return row;
			},
			listPendingForRun: async () => pendingApprovals,
			moveToRun: async () => undefined,
		},
	}),
});
await mockLeafModule({
	specifier: "../../../src/internal/approvals/repos/chatApprovalWritesRepo.js",
	factory: () => ({
		chatApprovalWritesRepo: { list: async () => [] },
	}),
});
await mockLeafModule({
	specifier: "../../../src/internal/autumnMcp/orgContextService.js",
	factory: () => ({
		autumnOrgContextService: { load: async () => ({ text: "org ctx" }) },
	}),
});
await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/sessions/agentThreadTitle.js",
	factory: () => ({
		generateThreadTitle: async () => undefined,
		persistThreadTitle: async () => undefined,
	}),
});
await mockLeafModule({
	specifier: "../../../src/lib/logger.js",
	factory: () => ({
		logger: {
			debug: () => {},
			error: () => {},
			info: () => {},
			warn: () => {},
		},
	}),
});

const { runAgentTurn } = await import(
	"../../../src/internal/agentRuntime/actions/runAgentTurn/runAgentTurn.js"
);

const thread = {
	channelId: "C1",
	provider: "slack",
	threadId: "thread_1",
	workspaceId: "T1",
};
const ctx = {
	env: AppEnv.Sandbox,
	logger: { debug: () => {}, error: () => {}, info: () => {}, warn: () => {} },
	org: { id: "org_1", slug: "acme" },
	providerUserId: "U1",
	thread,
	token: "t",
} as never;

const send = (text: string) => runAgentTurn({ ctx, params: { text } as never });

const parkCard = ({ requestId }: { requestId: string }) => {
	const fake = createFakeSession();
	parkOn(fake, requestId);
	storedSession = {
		env: AppEnv.Sandbox,
		newSession: false,
		sessionId: fake.id,
		state: {
			version: 1,
			continuationToken: fake.token,
			streamIndex: 2,
			status: "waiting",
			lastEventAt: 0,
			pendingRequests: [{ denyOptionId: "deny", kind: "gated", requestId }],
		},
		threadKey: "sandbox:slack:T1:C1:thread_1",
	};
	pendingApprovals = [
		{
			id: `approval_${requestId}`,
			run_id: fake.id,
			tool_args: {},
			tool_call_id: requestId,
			tool_name: "attach",
		} as unknown as ChatApproval,
	];
	return fake;
};

describe("production incident replications", () => {
	beforeEach(() => {
		fakeSessions.clear();
		deadTokens.clear();
		nextSession = 0;
		rebuildsAfterDeny = 0;
		posts.length = 0;
		cancelledRuns.length = 0;
		deletedSessions.length = 0;
		cancelledApprovals.length = 0;
		storedSession = undefined;
		pendingApprovals = [];
		tokenAlive = undefined;
	});

	test("Ayush 20:30 — a question over a pending card, child rebuilds after the deny", async () => {
		rebuildsAfterDeny = 3;
		const fake = parkCard({ requestId: "tc_attach" });

		const result = await send("is there a trial?");

		// One post carrying the deny AND the message; no separate drain turn.
		const messagePosts = posts.filter((post) => post.kind === "message");
		expect(messagePosts).toHaveLength(1);
		expect(messagePosts[0].inputResponses).toEqual([
			{ optionId: "deny", requestId: "tc_attach" },
		]);
		expect(fake.deferredMessages).toBe(0);
		expect(deletedSessions).toHaveLength(0);
		expect(["approval", "reply", "parked"]).toContain(result.kind);
	});

	test("exec 19:50 — superseding a card is one post, never a drain", async () => {
		parkCard({ requestId: "tc_sched" });

		await send(
			"for him start a schedule on scale and 3x the price every year for 4 years",
		);

		expect(posts.filter((post) => post.kind === "input")).toHaveLength(0);
		expect(posts.filter((post) => post.kind === "message")).toHaveLength(1);
		expect(cancelledApprovals).toEqual(["approval_tc_sched"]);
	});

	test("orphaned park — approval row gone but eve still parked (the dead-session trap)", async () => {
		const fake = parkCard({ requestId: "tc_orphan" });
		// The card row was cancelled/expired elsewhere; eve never heard.
		pendingApprovals = [];

		const result = await send("what does pro cost?");

		// The persisted pending set still answers the park in the same post.
		expect(fake.deferredMessages).toBe(0);
		expect(posts[0]?.inputResponses).toEqual([
			{ optionId: "deny", requestId: "tc_orphan" },
		]);
		expect(storedSession?.sessionId).toBe(fake.id);
		expect(result.kind).toBe("reply");
	});

	test("dead delivery hook — a fresh session instead of eve's silent re-home", async () => {
		const fake = parkCard({ requestId: "tc_hook" });
		pendingApprovals = [];
		if (storedSession) storedSession.state.pendingRequests = [];
		deadTokens.add(fake.token);
		tokenAlive = false;

		const result = await send("hello again");

		expect(deletedSessions).toContain(fake.id);
		expect(storedSession?.sessionId).not.toBe(fake.id);
		expect(result.kind).toBe("reply");
	});

	test("silent session — recovered on a fresh run, cards and run released", async () => {
		const fake = parkCard({ requestId: "tc_silent" });
		pendingApprovals = [];
		// Leaf lost track of the park entirely (pre-fix state) — eve defers.
		if (storedSession) storedSession.state.pendingRequests = [];

		const result = await send("is there a trial?");

		expect(fake.deferredMessages).toBe(1);
		expect(deletedSessions).toContain(fake.id);
		expect(cancelledRuns).toContain(fake.id);
		expect(result.kind).toBe("reply");
	}, 20_000);
});
