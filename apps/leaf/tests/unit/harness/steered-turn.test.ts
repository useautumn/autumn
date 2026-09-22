/** A message that lands mid-turn steers eve: the active turn is cancelled,
 * the session parks for a moment, and a replacement turn restarts with every
 * buffered message in context. The reader must read through that boundary.
 * Prod incidents 2026-09-16 (Slack C0B3S1ML7JP, 20:28Z) and 2026-09-17
 * (17:48Z): the cancel was unknown to leaf, `session.waiting` read as the
 * end, and the thread got two empty-reply warnings plus a stray "Appl". */

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

class MockEveStreamDisconnectedError extends Error {}
class MockEveStreamIdleTimeoutError extends Error {}

type StreamPass = { events: EveEvent[]; thenThrow?: "idle" };

let streamPasses: StreamPass[] = [];
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
		streamEveEvents: async function* () {
			const pass = streamPasses[
				Math.min(streamCallCount, streamPasses.length - 1)
			] ?? { events: [] };
			streamCallCount += 1;
			for (const event of pass.events) yield event;
			if (pass.thenThrow === "idle") {
				throw new MockEveStreamIdleTimeoutError("Eve stream idle timeout");
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
const { STEERED_TURN_STATUS } = await import(
	"../../../src/internal/agentRuntime/actions/runAgentTurn/execute/eveTurnReducer.js"
);

const event = (partial: Record<string, unknown>) =>
	partial as unknown as EveEvent;

const session = (): EveSessionRef => ({
	env: AppEnv.Sandbox,
	newSession: false,
	sessionId: "eve_session_1",
	state: { pendingRequests: [], streamIndex: 117 },
	threadKey: "sandbox:slack:T1:C1:thread_1",
});

const consume = ({ onAction }: { onAction: (input: unknown) => void }) =>
	consumeAgentTurn({
		auth: {} as never,
		env: AppEnv.Sandbox,
		logger: { error: () => {}, info: () => {}, warn: () => {} } as never,
		onAction: async (input: unknown) => onAction(input),
		orgId: "org_1",
		session: session(),
		token: "t",
	} as never);

const cancelledTurn = [
	event({ turnId: "turn_1", type: "turn.started" }),
	event({ type: "step.started" }),
	event({ messageDelta: "Appl", type: "message.appended" }),
	event({ turnId: "turn_1", type: "turn.cancelled" }),
	event({ type: "session.waiting" }),
];
const replacementTurn = [
	event({ turnId: "turn_2", type: "turn.started" }),
	event({ type: "step.started" }),
	event({
		finishReason: "stop",
		message: "Applied — TVH's trial now ends 2026-09-23. On approvals: …",
		type: "message.completed",
	}),
	event({ type: "session.waiting" }),
];

describe("a steered turn", () => {
	beforeEach(() => {
		streamCallCount = 0;
	});

	test("reads past the cancel to the replacement turn on one stream", async () => {
		const statuses: unknown[] = [];
		streamPasses = [{ events: [...cancelledTurn, ...replacementTurn] }];

		const outcome = await consume({
			onAction: (input) => statuses.push(input),
		});

		expect(outcome).toMatchObject({
			kind: "answered",
			text: "Applied — TVH's trial now ends 2026-09-23. On approvals: …",
		});
		expect(statuses).toContain(STEERED_TURN_STATUS);
	});

	test("reopens at the cursor when the stream closes on the parked boundary", async () => {
		streamPasses = [{ events: cancelledTurn }, { events: replacementTurn }];

		const outcome = await consume({ onAction: () => undefined });

		expect(outcome).toMatchObject({ kind: "answered" });
		expect(streamCallCount).toBe(2);
	});

	test("never reports the cancelled turn's partial text as the reply", async () => {
		streamPasses = [
			{ events: cancelledTurn, thenThrow: "idle" },
			{ events: replacementTurn },
		];

		const outcome = await consume({ onAction: () => undefined });

		expect(outcome).toMatchObject({ kind: "answered" });
		expect(JSON.stringify(outcome)).not.toContain('"Appl"');
	});
});
