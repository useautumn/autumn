/**
 * The subagent progress relay streams a delegated child session's tool starts
 * and partial text onto the parent's status channel, ends on terminal child
 * events, and swallows transport errors — a dead relay never fails the turn.
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

let streamedEvents: EveEvent[] = [];
let thenThrow: "disconnect" | "idle" | undefined;
const streamedSessionIds: string[] = [];

await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/client.js",
	factory: () => ({
		EveStreamDisconnectedError: MockEveStreamDisconnectedError,
		EveStreamIdleTimeoutError: MockEveStreamIdleTimeoutError,
		streamEveEvents: async function* ({
			session: streamSession,
		}: {
			session: EveSessionRef;
		}) {
			streamedSessionIds.push(streamSession.sessionId);
			for (const event of streamedEvents) yield event;
			if (thenThrow === "disconnect") {
				throw new MockEveStreamDisconnectedError("socket closed");
			}
			if (thenThrow === "idle") {
				throw new MockEveStreamIdleTimeoutError("idle");
			}
		},
	}),
});

await mockLeafModule({
	specifier: "../../../src/lib/logger.js",
	factory: () => ({
		logger: {
			debug: () => {},
			error: () => {},
			info: () => {},
			warn: () => {},
		},
	}),
});

const { watchSubagentProgress } = await import(
	"../../../src/internal/agentRuntime/actions/runAgentTurn/execute/watchSubagentProgress.js"
);

const auth = { token: "t" } as never;

const session: EveSessionRef = {
	env: AppEnv.Sandbox,
	newSession: false,
	sessionId: "parent_session",
	state: {
		version: 1,
		continuationToken: "token_1",
		streamIndex: 9,
		status: "waiting",
		lastEventAt: 0,
		pendingRequests: [],
	},
	threadKey: "sandbox:slack:T1:C1:thread_1",
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("watchSubagentProgress", () => {
	beforeEach(() => {
		streamedEvents = [];
		thenThrow = undefined;
		streamedSessionIds.length = 0;
	});

	test("relays child tool starts and partial text, ends on completion", async () => {
		streamedEvents = [
			{
				actions: [{ callId: "c1", toolName: "autumn__previewAttach" }],
				type: "actions.requested",
			},
			{ messageDelta: "Attaching now…", type: "message.appended" },
			{ type: "session.completed" },
		] as EveEvent[];

		const actions: string[] = [];
		const reasoning: string[] = [];
		watchSubagentProgress({
			auth,
			childSessionId: "child_1",
			onAction: (progress) => {
				if (typeof progress !== "string") actions.push(progress.label);
			},
			onReasoning: ({ text }) => reasoning.push(text),
			session,
			signal: new AbortController().signal,
		});
		await flush();

		expect(streamedSessionIds).toEqual(["child_1"]);
		expect(actions).toHaveLength(1);
		expect(reasoning).toEqual(["Attaching now…"]);
	});

	test("a dead child stream never throws out of the relay", async () => {
		streamedEvents = [
			{ messageDelta: "partial", type: "message.appended" },
		] as EveEvent[];
		thenThrow = "idle";

		const reasoning: string[] = [];
		expect(() =>
			watchSubagentProgress({
				auth,
				childSessionId: "child_2",
				onReasoning: ({ text }) => reasoning.push(text),
				session,
				signal: new AbortController().signal,
			}),
		).not.toThrow();
		await flush();
		expect(reasoning).toEqual(["partial"]);
	});

	test("does nothing when no status channel is attached", async () => {
		streamedEvents = [{ type: "session.completed" }] as EveEvent[];
		watchSubagentProgress({
			auth,
			childSessionId: "child_3",
			session,
			signal: new AbortController().signal,
		});
		await flush();
		expect(streamedSessionIds).toHaveLength(0);
	});
});
