/** An idle parent stream reconnects at its cursor, and a turn with a live
 * child session is never abandoned — only quiet across ALL sessions fails.
 * Prod incident 2026-08-25 (Slack thread C0BCAQQK0KS, 10:30Z/10:48Z). */

import { beforeEach, describe, expect, mock, test } from "bun:test";
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

type StreamPass = { events: EveEvent[]; thenThrow?: "idle" | "disconnect" };

let streamPasses: StreamPass[] = [];
let childEvents: EveEvent[] = [];
let childKeepsStreaming = true;
let streamCallCount = 0;

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
				// A real child relay ENDS when its own idle window expires; only a
				// child still streaming holds the parent open.
				if (childKeepsStreaming) await new Promise(() => undefined);
				// An idle window costs real time, so a dying child still vouches
				// for the parent across a pass rather than expiring in one tick.
				await new Promise((resolve) => setTimeout(resolve, 1));
				throw new MockEveStreamIdleTimeoutError("child idle");
			}
			const pass = streamPasses[
				Math.min(streamCallCount, streamPasses.length - 1)
			] ?? { events: [] };
			streamCallCount += 1;
			for (const event of pass.events) yield event;
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

const consume = () =>
	consumeAgentTurn({
		auth: {} as never,
		env: AppEnv.Sandbox,
		logger: { error: () => {}, info: () => {}, warn: () => {} } as never,
		onAction: async () => undefined,
		orgId: "org_1",
		session: session(),
		token: "t",
	} as never);

describe("an idle eve stream is a gap, not a dead end", () => {
	beforeEach(() => {
		streamCallCount = 0;
	});

	test("a turn that never resumes is reported once the budget is spent", async () => {
		streamPasses = [
			{ events: [event({ type: "turn.started" })], thenThrow: "idle" },
			{ events: [], thenThrow: "idle" },
			{ events: [], thenThrow: "idle" },
			{ events: [], thenThrow: "idle" },
		];

		await expect(consume()).rejects.toThrow(/stopped responding/i);
	});

	test("a turn that goes quiet then resumes still completes", async () => {
		streamPasses = [
			{
				events: [
					event({ type: "turn.started" }),
					event({ type: "step.started" }),
				],
				thenThrow: "idle",
			},
			{
				events: [
					event({
						finishReason: "stop",
						message: "Attached the annual plan.",
						type: "message.completed",
					}),
					event({ type: "session.waiting" }),
				],
			},
		];

		const outcome = await consume();
		expect(outcome).toMatchObject({
			kind: "answered",
			text: "Attached the annual plan.",
		});
		expect(streamCallCount).toBeGreaterThan(1);
	});
});

describe("a delegated child keeps the parent turn alive", () => {
	beforeEach(() => {
		streamCallCount = 0;
		childKeepsStreaming = true;
		childEvents = Array.from({ length: 40 }, () =>
			event({
				actions: [{ toolName: "autumn__previewAttach" }],
				type: "actions.requested",
			}),
		);
	});

	test("a long delegation outlasting the parent budget is still not abandoned", async () => {
		// The child never reports (its relay died) and the parent stays quiet for
		// MORE passes than MAX_IDLE_RESYNCS: today this fails the turn even though
		// eve is still working on the child session.
		childEvents = [];
		childKeepsStreaming = false;
		streamPasses = [
			{
				events: [
					event({ type: "turn.started" }),
					event({ childSessionId: "wrun_child_slow", type: "subagent.called" }),
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

		const outcome = await consume();
		expect(outcome).toMatchObject({ kind: "answered" });
	});

	test("a child that goes quiet mid-work still vouches until its own budget", async () => {
		// The child emits nothing for longer than the watcher's idle window: its
		// relay ends, and the parent must not immediately read as dead.
		childEvents = [];
		childKeepsStreaming = false;
		streamPasses = [
			{
				events: [
					event({ type: "turn.started" }),
					event({ childSessionId: "wrun_child_slow", type: "subagent.called" }),
				],
				thenThrow: "idle",
			},
			{ events: [], thenThrow: "idle" },
			{ events: [], thenThrow: "idle" },
			{ events: [], thenThrow: "idle" },
			{
				events: [
					event({
						finishReason: "stop",
						message: "Done.",
						type: "message.completed",
					}),
					event({ type: "session.waiting" }),
				],
			},
		];

		const outcome = await consume();
		expect(outcome).toMatchObject({ kind: "answered" });
	});

	test("a parent quiet while its child works is not abandoned", async () => {
		// The parent delegates, then emits nothing at all: every later pass is
		// an idle timeout. The child relay keeps reporting activity throughout.
		streamPasses = [
			{
				events: [
					event({ type: "turn.started" }),
					event({
						childSessionId: "wrun_child_1",
						type: "subagent.called",
					}),
				],
				thenThrow: "idle",
			},
			{ events: [], thenThrow: "idle" },
			{ events: [], thenThrow: "idle" },
			{ events: [], thenThrow: "idle" },
			{ events: [], thenThrow: "idle" },
			{
				events: [
					event({
						finishReason: "stop",
						message: "Attached the annual plan.",
						type: "message.completed",
					}),
					event({ type: "session.waiting" }),
				],
			},
		];

		const outcome = await consume();
		expect(outcome).toMatchObject({ kind: "answered" });
	});
});
