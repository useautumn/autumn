/**
 * When a turn's stream proves the session dead, runAgentTurn must delete the
 * session row and retry the message once on a fresh session — never leave a
 * poisoned session that fails every later message in the thread.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
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

class MockEveSessionGoneError extends Error {}
class MockEveSessionDeadError extends Error {
	constructor(sessionId: string) {
		super(`Eve session ${sessionId} is dead`);
		this.name = "EveSessionDeadError";
	}
}
await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/client.js",
	factory: () => ({
		EveSessionDeadError: MockEveSessionDeadError,
		EveSessionGoneError: MockEveSessionGoneError,
	}),
});

const existingSession: EveSessionRef = {
	env: AppEnv.Sandbox,
	newSession: false,
	sessionId: "eve_session_dead",
	state: {
		version: 1,
		continuationToken: "token_1",
		streamIndex: 57,
		status: "waiting",
		lastEventAt: 0,
	},
	threadKey: "sandbox:slack:T1:C1:thread_1",
};

await mockLeafModule({
	specifier:
		"../../../src/internal/agentRuntime/actions/runAgentTurn/setup/prepareAgentTurn.js",
	factory: () => ({
		prepareAgentTurn: async () => ({
			existingSession,
			orgContext: undefined,
			withdrawal: undefined,
		}),
	}),
});

const startedSessions: Array<string | undefined> = [];
await mockLeafModule({
	specifier:
		"../../../src/internal/agentRuntime/actions/runAgentTurn/setup/startAgentTurn.js",
	factory: () => ({
		startAgentTurn: async ({ session }: { session?: EveSessionRef }) => {
			startedSessions.push(session?.sessionId);
			return (
				session ?? {
					...existingSession,
					newSession: true,
					sessionId: "eve_session_fresh",
				}
			);
		},
	}),
});

let consumeCalls = 0;
await mockLeafModule({
	specifier:
		"../../../src/internal/agentRuntime/actions/runAgentTurn/execute/consumeAgentTurn.js",
	factory: () => ({
		consumeAgentTurn: async ({ session }: { session: EveSessionRef }) => {
			consumeCalls += 1;
			if (session.sessionId === "eve_session_dead") {
				throw new MockEveSessionDeadError(session.sessionId);
			}
			return { kind: "answered", text: "fresh answer" };
		},
	}),
});

await mockLeafModule({
	specifier:
		"../../../src/internal/agentRuntime/actions/runAgentTurn/finalize/resolveAgentTurnOutcome.js",
	factory: () => ({
		resolveAgentTurnOutcome: async ({ outcome }: { outcome: unknown }) => ({
			kind: "reply",
			outcome,
		}),
	}),
});

const deletedSessions: Array<{ reason: string; sessionId: string }> = [];
await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/repo.js",
	factory: () => ({
		deleteEveSession: async ({
			reason,
			sessionId,
		}: {
			reason: string;
			sessionId: string;
		}) => {
			deletedSessions.push({ reason, sessionId });
		},
	}),
});

await mockLeafModule({
	specifier: "../../../src/internal/autumnMcp/orgContextService.js",
	factory: () => ({
		autumnOrgContextService: { load: async () => ({ text: "org ctx" }) },
	}),
});

await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/sessions/agentThreadTitle.js",
	factory: () => ({
		generateThreadTitle: async () => undefined,
		persistThreadTitle: async () => undefined,
	}),
});

const { runAgentTurn } = await import(
	"../../../src/internal/agentRuntime/actions/runAgentTurn/runAgentTurn.js"
);

const ctx = {
	env: AppEnv.Sandbox,
	logger: { debug: () => {}, error: () => {}, info: () => {}, warn: () => {} },
	org: { id: "org_1", slug: "acme" },
	providerUserId: "U1",
	thread: {
		channelId: "C1",
		provider: "slack",
		threadId: "thread_1",
		workspaceId: "T1",
	},
	token: "t",
} as never;

describe("runAgentTurn dead-session recovery", () => {
	beforeEach(() => {
		startedSessions.length = 0;
		deletedSessions.length = 0;
		consumeCalls = 0;
	});

	test("deletes the dead session and answers from a fresh one in the same turn", async () => {
		const result = await runAgentTurn({
			ctx,
			params: { text: "is there a trial?" } as never,
		});

		expect(deletedSessions).toEqual([
			{ reason: "session_dead", sessionId: "eve_session_dead" },
		]);
		expect(startedSessions).toEqual(["eve_session_dead", undefined]);
		expect(consumeCalls).toBe(2);
		expect((result as { kind: string }).kind).toBe("reply");
	});
});
