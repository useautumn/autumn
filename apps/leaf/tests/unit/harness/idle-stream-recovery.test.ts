/**
 * Prod incident 2026-08-25 (thread C0BCAQQK0KS): a message with an attachment
 * superseded an open attach approval. Leaf withdrew the card and bundled the
 * deny into the post correctly, eve emitted two events and then went quiet.
 * The first idle timeout ended the turn: the user lost the message, the
 * attachment, and the card that had already been withdrawn.
 *
 * Red-failure mode (current behaviour):
 *  - recoverFromIdleStream returns on the FIRST EveStreamIdleTimeoutError and
 *    throws AGENT_UNREACHABLE_MESSAGE when no text arrived, so the 20-retry
 *    budget above it never applies to an idle stream.
 *
 * Green-success criteria (after fix):
 *  - An idle stream is reconnected at its cursor like any other gap; a turn
 *    that resumes after going quiet completes normally.
 *  - Only exhausting the retry budget surfaces a failure.
 */

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
let streamCallCount = 0;

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
		streamEveEvents: async function* () {
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

const consume = () =>
	consumeAgentTurn({
		auth: {} as never,
		env: AppEnv.Sandbox,
		logger: { error: () => {}, info: () => {}, warn: () => {} } as never,
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
