/**
 * A single eve stream disconnect during an approval resume (or a queued-turn
 * drain) must never surface as a failure. Reconnection lives inside eve's
 * ClientSession.stream(), so streamEveEvents is mocked the way eve behaves:
 * transparent reconnects at the cursor, raising EveStreamDisconnectedError only
 * once the SDK has given up.
 *
 * The contract under test:
 *  - A disconnect eve recovers from is invisible to both consumers.
 *  - Exhausted reconnects and idle timeouts return the write-evidence result
 *    (applied / failed / unverified) instead of throwing.
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

type StreamPass = {
	events: EveEvent[];
	thenThrow?: "disconnect" | "idle";
};

let streamPasses: StreamPass[] = [];
const streamCalls: number[] = [];
const streamPassesConsumed: number[] = [];

await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/client.js",
	factory: () => ({
		EveStreamDisconnectedError: MockEveStreamDisconnectedError,
		EveStreamIdleTimeoutError: MockEveStreamIdleTimeoutError,
		isEveTransportLost: (error: unknown) =>
			error instanceof MockEveStreamDisconnectedError ||
			error instanceof MockEveStreamIdleTimeoutError,
		postEveInputResponse: async () => ({
			continuationToken: "token_2",
			sessionId: "eve_session_1",
		}),
		streamEveEvents: async function* ({
			session: streamSession,
		}: {
			session: EveSessionRef;
		}) {
			streamCalls.push(streamSession.state.streamIndex);
			for (let index = 0; index < streamPasses.length; index += 1) {
				const pass = streamPasses[index];
				streamPassesConsumed.push(index);
				for (const event of pass.events) yield event;
				if (pass.thenThrow === "idle") {
					throw new MockEveStreamIdleTimeoutError("Eve stream idle timeout");
				}
				if (
					pass.thenThrow === "disconnect" &&
					index === streamPasses.length - 1
				) {
					throw new MockEveStreamDisconnectedError(
						"The socket connection was closed unexpectedly",
					);
				}
			}
		},
	}),
});

const upsertedStreamIndexes: number[] = [];
await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/repo.js",
	factory: () => ({
		upsertEveSession: async ({ state }: { state: EveSessionRef["state"] }) => {
			upsertedStreamIndexes.push(state.streamIndex);
		},
	}),
});

const loggedWarns: string[] = [];
await mockLeafModule({
	specifier: "../../../src/lib/logger.js",
	factory: () => ({
		logger: {
			error: () => {},
			info: () => {},
			warn: (_message: string, data?: { event?: string }) => {
				if (data?.event) loggedWarns.push(data.event);
			},
		},
	}),
});

const { consumeResumedAgentTurn } = await import(
	"../../../src/internal/agentRuntime/actions/submitAgentInput/consumeResumedAgentTurn.js"
);
const { drainParkedAgentTurn } = await import(
	"../../../src/internal/agentRuntime/actions/submitAgentInput/drainParkedAgentTurn.js"
);

const auth = { token: "t" } as never;

const makeSession = (): EveSessionRef => ({
	env: AppEnv.Sandbox,
	newSession: false,
	sessionId: "eve_session_1",
	state: {
		streamIndex: 0,
		pendingRequests: [],
	},
	threadKey: "sandbox:slack:T1:C1:thread_1",
});

const approvedWritePass = (thenThrow: StreamPass["thenThrow"]): StreamPass => ({
	events: [
		{ type: "turn.started" },
		{
			actions: [{ callId: "c1", toolName: "autumn__attach" }],
			type: "actions.requested",
		},
		{
			result: {
				callId: "c1",
				output: { ok: true },
				toolName: "autumn__attach",
			},
			status: "completed",
			type: "action.result",
		},
	] as EveEvent[],
	thenThrow,
});

describe("consumeResumedAgentTurn stream resilience", () => {
	beforeEach(() => {
		streamPasses = [];
		streamCalls.length = 0;
		streamPassesConsumed.length = 0;
		upsertedStreamIndexes.length = 0;
		loggedWarns.length = 0;
	});

	test("reconnects at the cursor after a disconnect and finishes the turn", async () => {
		streamPasses = [
			approvedWritePass("disconnect"),
			{
				events: [
					{ message: "Attached the plan.", type: "message.completed" },
					{ type: "session.waiting" },
				] as EveEvent[],
			},
		];

		const result = await consumeResumedAgentTurn({
			auth,
			expectedToolNames: ["autumn__attach"],
			orgId: "org_1",
			session: makeSession(),
		});

		expect(streamCalls).toEqual([0]);
		expect(streamPassesConsumed).toEqual([0, 1]);
		expect(result.approvedWriteFailed).toBe(false);
		expect(result.approvedWriteUnverified).toBe(false);
		expect(result.writes).toEqual([
			{ result: { ok: true }, status: "applied", toolName: "autumn__attach" },
		]);
		expect(result.text).toBe("Attached the plan.");
	});

	test("more gaps than the retry cap still finish when each reconnect progresses", async () => {
		streamPasses = [
			approvedWritePass("disconnect"),
			...Array.from({ length: 6 }, (_, gap) => ({
				events: [
					{
						messageDelta: `working ${gap} `,
						type: "message.appended",
					},
				] as EveEvent[],
				thenThrow: "disconnect" as const,
			})),
			{
				events: [
					{ message: "Attached the plan.", type: "message.completed" },
					{ type: "session.waiting" },
				] as EveEvent[],
			},
		];

		const result = await consumeResumedAgentTurn({
			auth,
			expectedToolNames: ["autumn__attach"],
			orgId: "org_1",
			session: makeSession(),
		});

		expect(streamCalls).toEqual([0]);
		expect(streamPassesConsumed).toHaveLength(8);
		expect(result.approvedWriteFailed).toBe(false);
		expect(result.text).toBe("Attached the plan.");
	});

	test("exhausted reconnects fall back to write evidence instead of throwing", async () => {
		streamPasses = [
			approvedWritePass("disconnect"),
			{ events: [], thenThrow: "disconnect" },
		];

		const result = await consumeResumedAgentTurn({
			auth,
			expectedToolNames: ["autumn__attach"],
			orgId: "org_1",
			session: makeSession(),
		});

		expect(result.approvedWriteFailed).toBe(false);
		expect(result.approvedWriteUnverified).toBe(false);
		expect(result.writes).toEqual([
			{ result: { ok: true }, status: "applied", toolName: "autumn__attach" },
		]);
	});

	test("resume idle timeout falls back to write evidence instead of throwing", async () => {
		streamPasses = [approvedWritePass("idle")];

		const result = await consumeResumedAgentTurn({
			auth,
			expectedToolNames: ["autumn__attach"],
			orgId: "org_1",
			session: makeSession(),
		});

		expect(result.approvedWriteFailed).toBe(false);
		expect(result.approvedWriteUnverified).toBe(false);
		expect(result.writes).toEqual([
			{ result: { ok: true }, status: "applied", toolName: "autumn__attach" },
		]);
	});
});

describe("drainParkedAgentTurn stream resilience", () => {
	beforeEach(() => {
		streamPasses = [];
		streamCalls.length = 0;
		streamPassesConsumed.length = 0;
		upsertedStreamIndexes.length = 0;
		loggedWarns.length = 0;
	});

	test("reconnects after a disconnect and finishes the drain", async () => {
		streamPasses = [
			{
				events: [{ type: "turn.started" }] as EveEvent[],
				thenThrow: "disconnect",
			},
			{ events: [{ type: "session.completed" }] as EveEvent[] },
		];

		const session = makeSession();
		await drainParkedAgentTurn({ auth, orgId: "org_1", session });

		expect(streamCalls).toEqual([0]);
		expect(streamPassesConsumed).toEqual([0, 1]);
		expect(session.state.streamIndex).toBe(2);
		expect(upsertedStreamIndexes).toEqual([2]);
	});

	test("exhausted reconnects settle the session instead of throwing", async () => {
		streamPasses = [{ events: [], thenThrow: "disconnect" }];

		const session = makeSession();
		await drainParkedAgentTurn({ auth, orgId: "org_1", session });

		expect(session.state.streamIndex).toBe(0);
		expect(upsertedStreamIndexes).toEqual([0]);
	});
});

describe("drainParkedAgentTurn", () => {
	beforeEach(() => {
		streamPasses = [];
		streamCalls.length = 0;
		streamPassesConsumed.length = 0;
		upsertedStreamIndexes.length = 0;
	});

	test("records a later park without deciding it", async () => {
		const gatedPark = {
			requests: [
				{
					action: {
						callId: "tc_1",
						input: {},
						kind: "tool-call",
						toolName: "autumn__attach",
					},
					display: "confirmation",
					options: [
						{ id: "approve", label: "Yes" },
						{ id: "deny", label: "No" },
					],
					prompt: "Approve tool call: autumn__attach",
					requestId: "tc_1",
				},
			],
			type: "input.requested",
		} as unknown as EveEvent;
		streamPasses = [
			{
				events: [
					{ type: "turn.started" },
					gatedPark,
					{ type: "session.waiting" },
				] as EveEvent[],
			},
		];

		const session = makeSession();
		await drainParkedAgentTurn({
			auth,
			orgId: "org_1",
			session,
		});

		expect(streamCalls).toHaveLength(1);
		expect(session.state.pendingRequests).toEqual([
			{ denyOptionId: "deny", kind: "gated", requestId: "tc_1" },
		]);
	});
});
