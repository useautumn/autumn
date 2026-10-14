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
		isEveTransportLost: (error: unknown) =>
			error instanceof MockEveStreamDisconnectedError ||
			error instanceof MockEveStreamIdleTimeoutError,
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
	specifier: "../../../src/internal/agentRuntime/eve/repo.js",
	factory: () => ({
		deleteEveSession: async () => undefined,
		upsertEveSession: async () => undefined,
	}),
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
		streamIndex: 33,
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

		expect(parentStreamCalls).toBe(2);

		const [log] = abandoned;
		expect(log.quiet_ms).toBeGreaterThanOrEqual(QUIET_CAP_MS);
		expect(log.quiet_ms).toBeLessThan(QUIET_CAP_MS + PASS_ADVANCE_MS);
	});

	test("a caller deadline does not settle a turn whose child is working", async () => {
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
		expect(parentStreamCalls).toBeGreaterThan(5);
	});
});
