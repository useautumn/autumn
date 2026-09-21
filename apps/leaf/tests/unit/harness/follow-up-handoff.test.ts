/** A follow-up eve has already accepted must never run with nobody reading
 * it. The accept-check and the reader's exit have to be one synchronous step,
 * because the post to eve takes time and the turn can finish during it.
 *
 * Prod 2026-09-21 (Slack C0B9L4G35U2, 13:55:26Z): the injection completed 27ms
 * AFTER the reader returned. eve had no turn left to cancel, started a fresh
 * one, and nobody was attached — it called listCustomers at 13:55:37 and leaf
 * only saw that work at 13:55:50, when the next message opened a stream and
 * replayed it. Every later reply in the thread was then one message behind. */

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

type StreamPass = { events: EveEvent[] };

let streamPasses: StreamPass[] = [];
let streamCallCount = 0;
/** Runs just before the event at this index is yielded, so a test can land an
 * injection inside the window the reader is exiting through. */
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
		streamEveEvents: async function* () {
			const pass = streamPasses[
				Math.min(streamCallCount, streamPasses.length - 1)
			] ?? { events: [] };
			streamCallCount += 1;
			let index = 0;
			for (const event of pass.events) {
				if (beforeEventAt?.index === index) {
					const hook = beforeEventAt;
					// One-shot: a message is injected once, not on every reopen.
					beforeEventAt = undefined;
					hook.run();
				}
				index += 1;
				yield event;
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
const { closeRun, registerRun } = await import(
	"../../../src/internal/runs/runRegistry.js"
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

const firstTurn = [
	event({ turnId: "turn_1", type: "turn.started" }),
	event({
		finishReason: "stop",
		message: "OK, now acting as resend in live.",
		type: "message.completed",
	}),
	// index 2: the reader decides here whether it may stop reading.
	event({ type: "session.waiting" }),
];
const replacementTurn = [
	event({ turnId: "turn_2", type: "turn.started" }),
	event({
		finishReason: "stop",
		message: "GRACEX TECHNOLOGIES SRL — on Marketing Pro.",
		type: "message.completed",
	}),
	event({ type: "session.waiting" }),
];

let posted: string[] = [];

/** A post that rejects only after the reader has reached its boundary: the
 * reservation is already counted, but eve never took the message. */
const failingRun = (key: string) => {
	const run = registerRun({
		key,
		kind: "message",
		ownerProviderUserId: "U1",
		sendUserMessage: async () => {
			await Bun.sleep(5);
			throw new Error(
				"Unable to connect. Is the computer able to access the url?",
			);
		},
	});
	run.resolveSessionId("eve_session_1");
	return run;
};

const activeRun = (key: string) => {
	const run = registerRun({
		key,
		kind: "message",
		ownerProviderUserId: "U1",
		sendUserMessage: async ({ text }) => {
			// eve has taken the message by the time this resolves; the reply is
			// coming on the stream whether or not anyone is still reading.
			posted.push(text);
		},
	});
	run.resolveSessionId("eve_session_1");
	return run;
};

const consume = ({
	run,
	settled,
}: {
	run?: ReturnType<typeof activeRun>;
	settled: unknown[];
}) =>
	consumeAgentTurn({
		auth: {} as never,
		env: AppEnv.Sandbox,
		logger: { error: () => {}, info: () => {}, warn: () => {} } as never,
		onSettledTurn: (outcome: unknown) => {
			settled.push(outcome);
		},
		orgId: "org_1",
		run,
		session: session(),
		token: "t",
	} as never);

describe("a follow-up eve already accepted", () => {
	beforeEach(() => {
		streamCallCount = 0;
		beforeEventAt = undefined;
		posted = [];
	});

	test("is read by the same reader when it lands as the turn settles", async () => {
		const run = activeRun("handoff-1");
		streamPasses = [{ events: [...firstTurn, ...replacementTurn] }];
		const settled: unknown[] = [];
		// The message is accepted while the reader is on its way out: eve has
		// nothing left to cancel, so it starts a fresh turn instead of steering.
		beforeEventAt = {
			index: 2,
			run: () => void run.injectFollowUp({ text: "find me 1 customer" }),
		};

		const outcome = await consume({ run, settled });

		expect(posted).toEqual(["find me 1 customer"]);
		// The settling turn's own reply still reaches the thread...
		expect(settled).toEqual([
			{ kind: "answered", text: "OK, now acting as resend in live." },
		]);
		// ...and the reply to the follow-up is what this read returns, rather
		// than being left on the stream for the next message to pick up.
		expect(outcome).toMatchObject({
			kind: "answered",
			text: "GRACEX TECHNOLOGIES SRL — on Marketing Pro.",
		});
		expect(run.pendingTurns).toBe(0);
		closeRun({ key: run.key, run });
	});

	test("is read across a stream that closes on the parked boundary", async () => {
		const run = activeRun("handoff-2");
		streamPasses = [{ events: firstTurn }, { events: replacementTurn }];
		const settled: unknown[] = [];
		beforeEventAt = {
			index: 2,
			run: () => void run.injectFollowUp({ text: "find me 1 customer" }),
		};

		const outcome = await consume({ run, settled });

		expect(settled).toHaveLength(1);
		expect(outcome).toMatchObject({
			kind: "answered",
			text: "GRACEX TECHNOLOGIES SRL — on Marketing Pro.",
		});
		expect(streamCallCount).toBe(2);
		closeRun({ key: run.key, run });
	});

	test("does not hold the reader open when nothing was accepted", async () => {
		const run = activeRun("handoff-3");
		streamPasses = [{ events: [...firstTurn, ...replacementTurn] }];
		const settled: unknown[] = [];

		const outcome = await consume({ run, settled });

		// No injection, so the first turn is the answer and the reader stops.
		expect(settled).toEqual([]);
		expect(outcome).toMatchObject({
			kind: "answered",
			text: "OK, now acting as resend in live.",
		});
		expect(run.settling).toBe(true);
		closeRun({ key: run.key, run });
	});

	test("is not claimed when its post never reached eve", async () => {
		const run = failingRun("handoff-5");
		// Both turns are on the stream, so a wrong claim is visible: the reader
		// would read past its own answer and return the second turn instead.
		streamPasses = [{ events: [...firstTurn, ...replacementTurn] }];
		const settled: unknown[] = [];
		beforeEventAt = {
			index: 2,
			run: () => {
				void run.injectFollowUp({ text: "find me 1 customer" }).catch(() => {});
			},
		};

		const outcome = await consume({ run, settled });

		// eve never accepted the message, so there is no replacement turn to
		// wait for. The reader answers what it read and stops.
		expect(settled).toEqual([]);
		expect(outcome).toMatchObject({
			kind: "answered",
			text: "OK, now acting as resend in live.",
		});
		// The coordinator's fallback run is the one that will carry the message;
		// this reader must be shut so the two cannot both drive the session.
		expect(run.settling).toBe(true);
		// A reservation released after a claim must not leave the count negative.
		expect(run.pendingTurns).toBe(0);
		closeRun({ key: run.key, run });
	});

	test("shuts the run to injections in the same step that stops reading", async () => {
		const run = activeRun("handoff-4");
		streamPasses = [{ events: firstTurn }];
		const settled: unknown[] = [];

		await consume({ run, settled });

		// The reader is gone, so a message must never be posted into eve here —
		// it belongs to a new run that will attach and read its reply.
		expect(run.injectFollowUp({ text: "too late" })).rejects.toThrow(
			"Run is settling",
		);
		expect(posted).toEqual([]);
		closeRun({ key: run.key, run });
	});
});
