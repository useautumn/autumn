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
		beforeEventAt = {
			index: 2,
			run: () => void run.injectFollowUp({ text: "find me 1 customer" }),
		};

		const outcome = await consume({ run, settled });

		expect(posted).toEqual(["find me 1 customer"]);
		expect(settled).toEqual([
			{ kind: "answered", text: "OK, now acting as resend in live." },
		]);
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
		streamPasses = [{ events: [...firstTurn, ...replacementTurn] }];
		const settled: unknown[] = [];
		beforeEventAt = {
			index: 2,
			run: () => {
				void run.injectFollowUp({ text: "find me 1 customer" }).catch(() => {});
			},
		};

		const outcome = await consume({ run, settled });

		expect(settled).toEqual([]);
		expect(outcome).toMatchObject({
			kind: "answered",
			text: "OK, now acting as resend in live.",
		});
		expect(run.settling).toBe(true);
		expect(run.pendingTurns).toBe(0);
		closeRun({ key: run.key, run });
	});

	test("shuts the run to injections in the same step that stops reading", async () => {
		const run = activeRun("handoff-4");
		streamPasses = [{ events: firstTurn }];
		const settled: unknown[] = [];

		await consume({ run, settled });

		expect(run.injectFollowUp({ text: "too late" })).rejects.toThrow(
			"Run is settling",
		);
		expect(posted).toEqual([]);
		closeRun({ key: run.key, run });
	});
});
