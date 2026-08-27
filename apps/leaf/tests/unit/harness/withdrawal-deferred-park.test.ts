/**
 * Withdrawing a subagent's approval card drops the user's message.
 *
 * eve's routeDeliverPayload (execution/subagent-hitl-proxy.js) splits one POST:
 * an inputResponse for a PROXIED child request goes to the child, and every
 * other field -- including `message` -- goes to the parent. The parent has no
 * pending batch of its own, so resolvePendingInput returns deferredMessage and
 * parks, stashing the message in eve.runtime.deferredStepInput. It emits only
 * turn.started / message.received / turn.completed / session.waiting and then
 * waits for a delivery that never comes.
 *
 * Prod 2026-08-27 wrun_01M11DJD2N6N0BC04TQRDE3CGD: stream advanced 32 -> 37 on
 * exactly that no-op batch, then silence to abandonment at 8m06s.
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

class MockEveStreamIdleTimeoutError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EveStreamIdleTimeoutError";
	}
}

let parentPasses: EveEvent[][] = [];
let parentStreamCalls = 0;
let repostedMessages: unknown[] = [];

await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/client.js",
	factory: () => ({
		EveSessionDeadError: class extends Error {},
		EveStreamDisconnectedError: class extends Error {},
		EveStreamIdleTimeoutError: MockEveStreamIdleTimeoutError,
		fastForwardEveStreamIndex: async () => undefined,
		isEveTransportLost: (error: unknown) =>
			error instanceof MockEveStreamIdleTimeoutError,
		postEveMessage: async ({ message }: { message?: unknown }) => {
			repostedMessages.push(message);
			return { continuationToken: "token_2", sessionId: "eve_session_1" };
		},
		resyncEveStreamIndex: async () => undefined,
		streamEveEvents: async function* () {
			const events = parentPasses[parentStreamCalls] ?? [];
			parentStreamCalls += 1;
			for (const event of events) yield event;
			// Nothing more ever arrives on a parked session.
			throw new MockEveStreamIdleTimeoutError("Eve stream idle timeout");
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
		streamIndex: 32,
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
		onAction: async () => undefined,
		orgId: "org_1",
		session: session(),
		token: "t",
	} as never);

describe("a withdrawal that eve defers is redelivered", () => {
	beforeEach(() => {
		parentStreamCalls = 0;
		repostedMessages = [];
	});

	test("a parked turn that ran tools is not mistaken for a deferral", async () => {
		// toolLabels is cleared as each result lands, so a completed tool call
		// used to leave the map empty and read as a deferred message.
		parentPasses = [
			[
				event({ type: "turn.started" }),
				event({
					actions: [{ callId: "c1", toolName: "autumn__getCustomer" }],
					type: "actions.requested",
				}),
				event({
					result: { callId: "c1", toolName: "autumn__getCustomer" },
					status: "ok",
					type: "action.result",
				}),
				event({ type: "session.waiting" }),
			],
		];

		const outcome = await consume();

		expect(outcome).toMatchObject({ kind: "silent" });
		expect(repostedMessages).toHaveLength(0);
	});

	test("the parked no-op turn does not silently swallow the message", async () => {
		// Exactly what eve emits for a deferred message: a turn that starts,
		// receives, completes and parks without ever doing any work.
		parentPasses = [
			[
				event({ type: "turn.started" }),
				event({ type: "message.received" }),
				event({ type: "turn.completed" }),
				event({ type: "session.waiting" }),
			],
		];

		const outcome = await consume();

		// A bare park after a withdrawal means the message is sitting in eve's
		// deferredStepInput. Leaf must redeliver it rather than report silence.
		expect(outcome).not.toMatchObject({ kind: "silent" });
	});
});
