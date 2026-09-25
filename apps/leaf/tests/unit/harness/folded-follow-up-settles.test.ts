/** A follow-up that lands mid-turn is folded by eve into the replacement turn,
 * so the reply the reader gets already answers it. eve starts a turn only after
 * taking in every message it holds, so a follow-up accepted before that start
 * is covered by it and the reader stops at the reply. A post still in flight
 * at the start stays owed, and that rare wait must end by the settle deadline,
 * not run past the caller's backstop.
 *
 * Prod 2026-09-24 (Slack C0B9L4G35U2, wrun_01M39A6KHF3QWFZ47SC0RWGPRS): the
 * merged reply posted at 08:58:44Z, a full 120s idle window opened at
 * 09:00:23Z, and the backstop fired at 09:01:48Z with "took too long" — 13s
 * before the reader would have settled silently on its own. */

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
/** streamEveEvents' own default when a caller passes no window. */
const DEFAULT_IDLE_WINDOW_MS = 120_000;

let nowMs = TURN_START.getTime();
const advanceClock = (byMs: number) => {
	nowMs += byMs;
	setSystemTime(new Date(nowMs));
};

let streamPasses: EveEvent[][] = [];
let streamCallCount = 0;
let idleWindows: number[] = [];
/** Run just before the event at their index is yielded on the first pass. */
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
					// Let a post that can land do so before the next event.
					await Bun.sleep(1);
				}
				index += 1;
				yield event;
			}
			// eve has nothing more to say: the window armed after the last event
			// runs out in full.
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

/** The follow-up steers the first turn; eve folds it into the replacement,
 * which answers both messages at once. */
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
		// Accepted while turn_1 runs, so eve folds it into turn_2.
		beforeEventAt.set(1, () => void run.injectFollowUp({ text: FOLLOW_UP }));
		const settled: unknown[] = [];

		const outcome = await consume({ run, settled });

		// The merged reply is the read's own answer, returned at once rather
		// than handed off while the reader waits for a turn that never comes.
		expect(outcome).toMatchObject({ kind: "answered", text: MERGED_REPLY });
		expect(settled).toEqual([]);
		expect(idleWindows).toEqual([]);
		expect(run.pendingTurns).toBe(0);
	});

	test("still in flight at the turn start, it ends by the deadline", async () => {
		// eve took the message before starting turn_2, but its accept had not
		// reached leaf yet, so leaf cannot tell it was folded in.
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

		// The merged reply reached the thread once...
		expect(settled).toEqual([{ kind: "answered", text: MERGED_REPLY }]);
		// ...and the wait for a turn that never comes ends without a second post.
		expect(outcome).toEqual({ declined: true, kind: "silent" });

		const elapsedMs = nowMs - TURN_START.getTime();
		expect(elapsedMs).toBeLessThanOrEqual(turnDeadlineFrom({ startedAt: 0 }));
		expect(elapsedMs).toBeLessThan(TURN_BACKSTOP_MS);
		// The last window was cut short to end on the deadline.
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
		// The replacement works for 140s before replying, so the window armed
		// after its reply opens 10s before the deadline.
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
