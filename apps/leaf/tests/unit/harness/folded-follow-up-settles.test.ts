import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	setSystemTime,
	test,
} from "bun:test";
import { AppEnv } from "@autumn/shared";
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

class MockEveStreamDisconnectedError extends Error {}
class MockEveStreamIdleTimeoutError extends Error {}

const TURN_START = new Date("2026-09-24T08:58:28Z");
const DEFAULT_IDLE_WINDOW_MS = 120_000;

let nowMs = TURN_START.getTime();
const advanceClock = (byMs: number) => {
	nowMs += byMs;
	setSystemTime(new Date(nowMs));
};

let streamPasses: EveEvent[][] = [];
let streamCallCount = 0;
let idleWindows: number[] = [];
let beforeEventAt = new Map<number, () => void>();

await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/client.js",
	factory: () => ({
		EveSessionDeadError: class extends Error {},
		EveStreamDisconnectedError: MockEveStreamDisconnectedError,
		EveStreamIdleTimeoutError: MockEveStreamIdleTimeoutError,
		isEveTransportLost: (error: unknown) =>
			error instanceof MockEveStreamDisconnectedError ||
			error instanceof MockEveStreamIdleTimeoutError,
		streamEveEvents: async function* ({
			idleTimeoutMs = DEFAULT_IDLE_WINDOW_MS,
		}: {
			idleTimeoutMs?: number | (() => number);
		}) {
			const events = streamPasses[streamCallCount] ?? [];
			streamCallCount += 1;
			let index = 0;
			for (const event of events) {
				const hook = beforeEventAt.get(index);
				if (hook) {
					beforeEventAt.delete(index);
					hook();
					await Bun.sleep(1);
				}
				index += 1;
				yield event;
			}
			const window =
				typeof idleTimeoutMs === "function" ? idleTimeoutMs() : idleTimeoutMs;
			idleWindows.push(window);
			advanceClock(window);
			throw new MockEveStreamIdleTimeoutError("Eve stream idle timeout");
		},
	}),
});

await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/repo.js",
	factory: () => ({
		deleteEveSession: async () => undefined,
		upsertEveSession: async () => undefined,
	}),
});

const { consumeAgentTurn } = await import(
	"../../../src/internal/agentRuntime/actions/runAgentTurn/execute/consumeAgentTurn.js"
);
const { registerRun } = await import(
	"../../../src/internal/runs/runRegistry.js"
);
const { TURN_BACKSTOP_MS, turnDeadlineFrom } = await import(
	"../../../src/internal/agentRuntime/turnBudget.js"
);

const event = (partial: Record<string, unknown>) =>
	partial as unknown as EveEvent;

const session = (): EveSessionRef => ({
	env: AppEnv.Sandbox,
	newSession: false,
	sessionId: "eve_session_1",
	state: { pendingRequests: [], streamIndex: 0 },
	threadKey: "sandbox:slack:T1:C1:thread_1",
});

const MERGED_REPLY =
	"OK, now acting as new2 in sandbox.\n\nNo — there's no address field on Autumn customers.";

const steeredIntoOneReply = [
	event({ turnId: "turn_1", type: "turn.started" }),
	event({ turnId: "turn_1", type: "turn.cancelled" }),
	event({ type: "session.waiting" }),
	event({ turnId: "turn_2", type: "turn.started" }),
	event({
		finishReason: "stop",
		message: MERGED_REPLY,
		type: "message.completed",
	}),
	event({ type: "session.waiting" }),
];

const FOLLOW_UP = "can you update a customer's address?";

const consume = ({
	run,
	settled,
}: {
	run: ReturnType<typeof registerRun>;
	settled: unknown[];
}) =>
	consumeAgentTurn({
		auth: {} as never,
		deadlineAt: turnDeadlineFrom({ startedAt: TURN_START.getTime() }),
		env: AppEnv.Sandbox,
		logger: { error: () => {}, info: () => {}, warn: () => {} } as never,
		onSettledTurn: (settledOutcome: unknown) => {
			settled.push(settledOutcome);
		},
		orgId: "org_1",
		run,
		session: session(),
		token: "t",
	} as never);

describe("a follow-up folded into the reply it was waiting for", () => {
	beforeEach(() => {
		streamCallCount = 0;
		idleWindows = [];
		beforeEventAt = new Map();
		nowMs = TURN_START.getTime();
		setSystemTime(TURN_START);
	});

	afterEach(() => {
		setSystemTime();
	});

	test("is covered by the turn that starts after eve accepts it", async () => {
		const run = registerRun({
			key: "folded-follow-up-1",
			kind: "message",
			ownerProviderUserId: "U1",
			sendUserMessage: async () => undefined,
		});
		run.resolveSessionId("eve_session_1");
		streamPasses = [steeredIntoOneReply];
		beforeEventAt.set(1, () => void run.injectFollowUp({ text: FOLLOW_UP }));
		const settled: unknown[] = [];

		const outcome = await consume({ run, settled });

		expect(outcome).toMatchObject({ kind: "answered", text: MERGED_REPLY });
		expect(settled).toEqual([]);
		expect(idleWindows).toEqual([]);
		expect(run.pendingTurns).toBe(0);
	});

	test("still in flight at the turn start, it ends by the deadline", async () => {
		let acceptPost = () => {};
		const run = registerRun({
			key: "folded-follow-up-2",
			kind: "message",
			ownerProviderUserId: "U1",
			sendUserMessage: () =>
				new Promise<void>((resolve) => {
					acceptPost = resolve;
				}),
		});
		run.resolveSessionId("eve_session_1");
		streamPasses = [steeredIntoOneReply];
		beforeEventAt.set(1, () => void run.injectFollowUp({ text: FOLLOW_UP }));
		beforeEventAt.set(4, () => acceptPost());
		const settled: unknown[] = [];

		const outcome = await consume({ run, settled });

		expect(settled).toEqual([{ kind: "answered", text: MERGED_REPLY }]);
		expect(outcome).toEqual({ declined: true, kind: "silent" });

		const elapsedMs = nowMs - TURN_START.getTime();
		expect(elapsedMs).toBeLessThanOrEqual(turnDeadlineFrom({ startedAt: 0 }));
		expect(elapsedMs).toBeLessThan(TURN_BACKSTOP_MS);
		expect(idleWindows.at(-1)).toBeLessThan(idleWindows[0]);
	});

	test("a late event does not stretch the wait past the deadline", async () => {
		let acceptPost = () => {};
		const run = registerRun({
			key: "folded-follow-up-3",
			kind: "message",
			ownerProviderUserId: "U1",
			sendUserMessage: () =>
				new Promise<void>((resolve) => {
					acceptPost = resolve;
				}),
		});
		run.resolveSessionId("eve_session_1");
		streamPasses = [steeredIntoOneReply];
		beforeEventAt.set(1, () => void run.injectFollowUp({ text: FOLLOW_UP }));
		beforeEventAt.set(4, () => {
			advanceClock(140_000);
			acceptPost();
		});
		const settled: unknown[] = [];

		const outcome = await consume({ run, settled });

		expect(settled).toEqual([{ kind: "answered", text: MERGED_REPLY }]);
		expect(outcome).toEqual({ declined: true, kind: "silent" });
		const elapsedMs = nowMs - TURN_START.getTime();
		expect(elapsedMs).toBeLessThanOrEqual(turnDeadlineFrom({ startedAt: 0 }));
		expect(idleWindows).toEqual([10_000]);
	});
});
