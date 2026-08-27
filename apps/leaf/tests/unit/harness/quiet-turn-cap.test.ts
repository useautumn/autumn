/**
 * The parent-quiet cap in consumeAgentTurn: a turn with NO live child that has
 * been silent past MAX_QUIET_MS (2.5 min) settles on the clock, not after the
 * MAX_IDLE_RESYNCS (3) budget is spent.
 *
 * The existing idle-stream-recovery suite cannot see this: its mock stream
 * never advances any clock, so msSinceActivity() is always ~0 and the resync
 * budget always wins. Here the mock stream advances a FAKE clock between
 * passes, so quiet time grows without real waiting, and the two paths settle
 * at different pass counts with different quiet_ms.
 *
 * Discriminating signal (per-pass advance = 80s):
 *  - with the quiet cap: settles after 2 parent passes, quiet_ms ~160_000
 *  - without it:         settles after 4 parent passes, quiet_ms ~320_000
 */

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

const TURN_START = new Date("2026-08-26T10:00:00Z");
const QUIET_CAP_MS = 150_000;
const PASS_ADVANCE_MS = 80_000;

let nowMs = TURN_START.getTime();
const advanceClock = (byMs: number) => {
	nowMs += byMs;
	setSystemTime(new Date(nowMs));
};

type StreamPass = { events: EveEvent[]; thenThrow?: "idle" | "disconnect" };

let streamPasses: StreamPass[] = [];
let childEvents: EveEvent[] = [];
let childKeepsStreaming = true;
let parentStreamCalls = 0;

await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/client.js",
	factory: () => ({
		EveSessionDeadError: class extends Error {},
		EveStreamDisconnectedError: MockEveStreamDisconnectedError,
		EveStreamIdleTimeoutError: MockEveStreamIdleTimeoutError,
		fastForwardEveStreamIndex: async () => undefined,
		isEveTransportLost: (error: unknown) =>
			error instanceof MockEveStreamDisconnectedError ||
			error instanceof MockEveStreamIdleTimeoutError,
		resyncEveStreamIndex: async () => undefined,
		streamEveEvents: async function* ({ session }: { session: EveSessionRef }) {
			if (session.sessionId.startsWith("wrun_child")) {
				for (const event of childEvents) {
					yield event;
					await new Promise((resolve) => setTimeout(resolve, 1));
				}
				if (childKeepsStreaming) await new Promise(() => undefined);
				throw new MockEveStreamIdleTimeoutError("child idle");
			}
			const pass = streamPasses[
				Math.min(parentStreamCalls, streamPasses.length - 1)
			] ?? { events: [] };
			parentStreamCalls += 1;
			for (const event of pass.events) yield event;
			// A real idle window burns wall-clock before it throws.
			advanceClock(PASS_ADVANCE_MS);
			if (pass.thenThrow === "idle") {
				throw new MockEveStreamIdleTimeoutError("Eve stream idle timeout");
			}
			if (pass.thenThrow === "disconnect") {
				throw new MockEveStreamDisconnectedError("socket closed");
			}
		},
	}),
});

await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/sessionState.js",
	factory: () => ({
		advanceStreamCursor: (session: EveSessionRef) => {
			session.state.streamIndex += 1;
		},
		saveEveSessionState: async () => undefined,
		statusAfterTerminalEvent: (eventType: string) =>
			eventType === "session.completed" ? "completed" : "waiting",
	}),
});

await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/repo.js",
	factory: () => ({ deleteEveSession: async () => undefined }),
});

const { consumeAgentTurn } = await import(
	"../../../src/internal/agentRuntime/actions/runAgentTurn/execute/consumeAgentTurn.js"
);

const event = (partial: Record<string, unknown>) =>
	partial as unknown as EveEvent;

const session = (): EveSessionRef => ({
	env: AppEnv.Sandbox,
	newSession: false,
	sessionId: "eve_session_1",
	state: {
		version: 1,
		continuationToken: "token_1",
		streamIndex: 33,
		status: "running",
		lastEventAt: 0,
		pendingRequests: [],
	},
	threadKey: "sandbox:slack:T1:C1:thread_1",
});

type AbandonedLog = { quiet_ms: number; turn_ms: number };

const consumeAndCaptureAbandon = async () => {
	const abandoned: AbandonedLog[] = [];
	const logger = {
		error: (
			_message: string,
			meta?: { event?: string; data?: AbandonedLog },
		) => {
			if (meta?.event === "leaf.eve_turn_abandoned" && meta.data) {
				abandoned.push(meta.data);
			}
		},
		info: () => {},
		warn: () => {},
	};
	const outcome = await consumeAgentTurn({
		auth: {} as never,
		env: AppEnv.Sandbox,
		logger: logger as never,
		onAction: async () => undefined,
		orgId: "org_1",
		session: session(),
		token: "t",
	} as never);
	return { abandoned, outcome };
};

// Nine idle passes: far more than either exit path needs, so the pass count at
// settle time is decided purely by which condition fired.
const nineQuietPasses = (first: EveEvent[]): StreamPass[] => [
	{ events: first, thenThrow: "idle" },
	...Array.from({ length: 8 }, () => ({
		events: [] as EveEvent[],
		thenThrow: "idle" as const,
	})),
];

describe("a parent quiet past the cap settles on the clock", () => {
	beforeEach(() => {
		parentStreamCalls = 0;
		childEvents = [];
		childKeepsStreaming = false;
		nowMs = TURN_START.getTime();
		setSystemTime(TURN_START);
	});

	afterEach(() => {
		setSystemTime();
	});

	test("settles at the quiet cap, before the idle-resync budget is spent", async () => {
		streamPasses = nineQuietPasses([
			event({ type: "turn.started" }),
			event({
				finishReason: "stop",
				message: "Partial answer so far.",
				type: "message.completed",
			}),
		]);

		const { abandoned, outcome } = await consumeAndCaptureAbandon();

		expect(outcome).toMatchObject({
			kind: "answered",
			text: "Partial answer so far.",
		});
		expect(abandoned).toHaveLength(1);

		// The quiet cap fires the pass after quiet time crosses 150s. Spending
		// the 3-resync budget instead takes two more passes and >= 320s quiet.
		expect(parentStreamCalls).toBe(2);

		const [log] = abandoned;
		expect(log.quiet_ms).toBeGreaterThanOrEqual(QUIET_CAP_MS);
		expect(log.quiet_ms).toBeLessThan(QUIET_CAP_MS + PASS_ADVANCE_MS);
	});

	test("a caller deadline does not settle a turn whose child is working", async () => {
		// Prod 2026-08-27 17:30:40 wrun_01M1247EP8R8ZBDA5QXXFSZQPG: the deadline
		// fired with quiet_ms 299 while the investigator had 46 events in flight.
		// The child completed 2m44s later, into a turn already reported failed.
		childKeepsStreaming = true;
		childEvents = Array.from({ length: 3 }, () =>
			event({
				actions: [{ toolName: "autumn__previewAttach" }],
				type: "actions.requested",
			}),
		);
		// Quiet passes carry the turn past the deadline, then eve resumes and
		// finishes -- exactly what prod's child did 2m44s after being cut off.
		streamPasses = [
			{
				events: [
					event({ type: "turn.started" }),
					event({ childSessionId: "wrun_child_1", type: "subagent.called" }),
				],
				thenThrow: "idle",
			},
			{ events: [], thenThrow: "idle" },
			{ events: [], thenThrow: "idle" },
			{
				events: [
					event({
						finishReason: "stop",
						message: "The delegated answer.",
						type: "message.completed",
					}),
					event({ type: "session.waiting" }),
				],
			},
		];

		const abandoned: AbandonedLog[] = [];
		const logger = {
			error: (
				_message: string,
				meta?: { event?: string; data?: AbandonedLog },
			) => {
				if (meta?.event === "leaf.eve_turn_abandoned" && meta.data) {
					abandoned.push(meta.data);
				}
			},
			info: () => {},
			warn: () => {},
		};
		const outcome = await consumeAgentTurn({
			auth: {} as never,
			// Two passes of virtual clock, so the third crosses it.
			deadlineAt: TURN_START.getTime() + 2 * PASS_ADVANCE_MS,
			env: AppEnv.Sandbox,
			logger: logger as never,
			onAction: async () => undefined,
			orgId: "org_1",
			session: session(),
			token: "t",
		} as never);

		expect(abandoned).toHaveLength(0);
		expect(outcome).toMatchObject({
			kind: "answered",
			text: "The delegated answer.",
		});
	});

	test("a live child suppresses the quiet cap even when the parent is silent", async () => {
		// Same silent parent, but a child relay is still streaming: the turn is
		// working, so neither the quiet cap nor the resync budget may settle it.
		childKeepsStreaming = true;
		childEvents = Array.from({ length: 3 }, () =>
			event({
				actions: [{ toolName: "autumn__previewAttach" }],
				type: "actions.requested",
			}),
		);
		streamPasses = [
			{
				events: [
					event({ type: "turn.started" }),
					event({ childSessionId: "wrun_child_1", type: "subagent.called" }),
				],
				thenThrow: "idle",
			},
			{ events: [], thenThrow: "idle" },
			{ events: [], thenThrow: "idle" },
			{ events: [], thenThrow: "idle" },
			{ events: [], thenThrow: "idle" },
			{ events: [], thenThrow: "idle" },
			{
				events: [
					event({
						finishReason: "stop",
						message: "Done after a long delegation.",
						type: "message.completed",
					}),
					event({ type: "session.waiting" }),
				],
			},
		];

		const { abandoned, outcome } = await consumeAndCaptureAbandon();

		expect(abandoned).toHaveLength(0);
		expect(outcome).toMatchObject({
			kind: "answered",
			text: "Done after a long delegation.",
		});
		// Six quiet passes at 80s each is well past the 150s cap, proving the
		// live child — not a short clock — is what kept the turn alive.
		expect(parentStreamCalls).toBeGreaterThan(5);
	});
});
