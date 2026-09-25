/** A follow-up that lands mid-turn is folded by eve into the replacement turn,
 * so the reply the reader posts already answers it. The reader still counts it
 * as owed and waits on a quiet stream for a turn that never comes; that wait
 * must end by the settle deadline, not run past the caller's backstop.
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
/** Runs just before the event at this index is yielded on the first pass. */
let beforeEventAt: { index: number; run: () => void } | undefined;

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
			idleTimeoutMs?: number;
		}) {
			const events = streamPasses[streamCallCount] ?? [];
			streamCallCount += 1;
			let index = 0;
			for (const event of events) {
				if (beforeEventAt?.index === index) {
					const hook = beforeEventAt;
					beforeEventAt = undefined;
					hook.run();
					// Let the post land before eve reports the steer.
					await Bun.sleep(1);
				}
				index += 1;
				yield event;
			}
			// eve has nothing more to say: the window runs out in full.
			idleWindows.push(idleTimeoutMs);
			advanceClock(idleTimeoutMs);
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

describe("a follow-up folded into the reply it was waiting for", () => {
	beforeEach(() => {
		streamCallCount = 0;
		idleWindows = [];
		nowMs = TURN_START.getTime();
		setSystemTime(TURN_START);
	});

	afterEach(() => {
		setSystemTime();
	});

	test("settles silently by the deadline, inside the caller's backstop", async () => {
		const run = registerRun({
			key: "folded-follow-up-1",
			kind: "message",
			ownerProviderUserId: "U1",
			sendUserMessage: async () => undefined,
		});
		run.resolveSessionId("eve_session_1");
		streamPasses = [steeredIntoOneReply];
		beforeEventAt = {
			index: 1,
			run: () =>
				void run.injectFollowUp({
					text: "can you update a customer's address?",
				}),
		};
		const settled: unknown[] = [];

		const outcome = await consumeAgentTurn({
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
});
