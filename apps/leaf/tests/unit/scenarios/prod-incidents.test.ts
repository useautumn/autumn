/**
 * Replications of the 24 Aug production incidents against Eve's fixed-session
 * contract: follow-ups run while approvals remain pending.
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
	events: EveEvent[];
	id: string;
	parks: Park[];
};
const fakeSessions = new Map<string, FakeSession>();
const deadSessions = new Set<string>();
let nextSession = 0;

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
		events: [],
		id: `wrun_fake_${nextSession}`,
		parks: [],
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
	session.parks = session.parks.filter((park) => !answered.has(park.requestId));
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
				return { sessionId: created.id };
			}
			if (deadSessions.has(session.sessionId)) {
				throw new MockEveSessionGoneError("session_not_active");
			}
			const fake = fakeSessions.get(session.sessionId);
			if (!fake) throw new MockEveSessionGoneError("session was not found");
			deliver({ inputResponses, message, session: fake });
			return { sessionId: fake.id };
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
			return { sessionId: fake.id };
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
const detachedRuns: string[] = [];
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
			detachPendingForRun: async ({ runId }: { runId: string }) => {
				detachedRuns.push(runId);
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
			streamIndex: 2,
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
		deadSessions.clear();
		nextSession = 0;
		posts.length = 0;
		deletedSessions.length = 0;
		cancelledApprovals.length = 0;
		detachedRuns.length = 0;
		storedSession = undefined;
		pendingApprovals = [];
	});

	test("a question leaves the approval pending and reaches the root once", async () => {
		const fake = parkCard({ requestId: "tc_attach" });

		const result = await send("is there a trial?");

		const messagePosts = posts.filter((post) => post.kind === "message");
		expect(messagePosts).toHaveLength(1);
		expect(messagePosts[0]?.inputResponses).toBeUndefined();
		expect(String(messagePosts[0]?.message)).toContain("is there a trial?");
		expect(fake.parks).toEqual([{ kind: "gated", requestId: "tc_attach" }]);
		expect(deletedSessions).toHaveLength(0);
		expect(cancelledApprovals).toEqual([]);
		expect(detachedRuns).toEqual([fake.id]);
		expect(result.kind).toBe("reply");
	});

	test("a replacement request releases the old park without cancelling early", async () => {
		const fake = parkCard({ requestId: "tc_sched" });

		const message = "actually scrap that -- do 100 now and then 1200 next year";
		await send(message);

		expect(posts.filter((post) => post.kind === "input")).toHaveLength(0);
		const messagePosts = posts.filter((post) => post.kind === "message");
		expect(messagePosts).toHaveLength(1);
		expect(messagePosts[0]?.inputResponses).toBeUndefined();
		expect(String(messagePosts[0]?.message)).toContain(message);
		expect(cancelledApprovals).toEqual([]);
		expect(detachedRuns).toEqual([fake.id]);
	});

	test("orphaned park — approval row gone but eve still parked (the dead-session trap)", async () => {
		const fake = parkCard({ requestId: "tc_orphan" });
		// The card row was cancelled/expired elsewhere; eve never heard.
		pendingApprovals = [];

		const result = await send("what does pro cost?");

		expect(posts[0]?.inputResponses).toBeUndefined();
		expect(fake.parks).toEqual([{ kind: "gated", requestId: "tc_orphan" }]);
		expect(storedSession?.sessionId).toBe(fake.id);
		expect(result.kind).toBe("reply");
	});

	test("dead delivery hook — a fresh session instead of eve's silent re-home", async () => {
		const fake = parkCard({ requestId: "tc_hook" });
		pendingApprovals = [];
		if (storedSession) storedSession.state.pendingRequests = [];
		deadSessions.add(fake.id);

		const result = await send("hello again");

		// The upsert keys on the thread, so re-homing rewrites session_id in
		// place; the row does not need deleting first.
		expect(storedSession?.sessionId).not.toBe(fake.id);
		expect(result.kind).toBe("reply");
	});

	test("an untracked Eve approval does not swallow the next message", async () => {
		const fake = parkCard({ requestId: "tc_silent" });
		pendingApprovals = [];
		if (storedSession) storedSession.state.pendingRequests = [];

		const result = await send("is there a trial?");

		expect(fake.parks).toEqual([{ kind: "gated", requestId: "tc_silent" }]);
		expect(deletedSessions).not.toContain(fake.id);
		expect(result.kind).toBe("reply");
	});
});
