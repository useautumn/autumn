/**
 * A session that is alive at the transport level but never emits again is
 * dead, not flaky: exhausting the reconnect budget with ZERO events must
 * classify as EveSessionDeadError, and runAgentTurn must recover by deleting
 * the session row and retrying the message once on a fresh session — instead
 * of poisoning every later message in the thread.
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
class MockEveSessionGoneError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EveSessionGoneError";
	}
}
class MockEveSessionDeadError extends Error {
	constructor(sessionId: string) {
		super(`Eve session ${sessionId} is dead`);
		this.name = "EveSessionDeadError";
	}
}

let streamBehaviour: "silent-disconnects" | "events" = "silent-disconnects";
await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/client.js",
	factory: () => ({
		EveSessionDeadError: MockEveSessionDeadError,
		EveSessionGoneError: MockEveSessionGoneError,
		EveStreamDisconnectedError: MockEveStreamDisconnectedError,
		EveStreamIdleTimeoutError: MockEveStreamIdleTimeoutError,
		streamEveEvents: async function* () {
			if (streamBehaviour === "silent-disconnects") {
				throw new MockEveStreamDisconnectedError("socket closed");
			}
			yield { type: "turn.started" };
			yield { message: "hi", type: "message.completed" };
			yield { type: "session.waiting" };
		},
	}),
});
await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/sessionState.js",
	factory: () => ({
		initialEveSessionState: (continuationToken: string) => ({
			continuationToken,
			streamIndex: 0,
			pendingRequests: [],
		}),
		saveEveSessionState: async () => undefined,
	}),
});
await mockLeafModule({
	specifier:
		"../../../src/internal/agentRuntime/actions/runAgentTurn/execute/applyEveEvent.js",
	factory: () => ({
		applyEveEvent: async ({ progress }: { progress: unknown }) => ({
			progress,
		}),
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

const { consumeAgentTurn } = await import(
	"../../../src/internal/agentRuntime/actions/runAgentTurn/execute/consumeAgentTurn.js"
);

const logger = {
	debug: () => {},
	error: () => {},
	info: () => {},
	warn: () => {},
} as never;

const makeSession = (): EveSessionRef => ({
	env: AppEnv.Sandbox,
	newSession: false,
	sessionId: "eve_session_dead",
	state: {
		continuationToken: "token_1",
		streamIndex: 57,
		pendingRequests: [],
	},
	threadKey: "sandbox:slack:T1:C1:thread_1",
});

describe("consumeAgentTurn on a silent session", () => {
	beforeEach(() => {
		streamBehaviour = "silent-disconnects";
	});

	test("exhausted reconnects with zero events classify as a dead session", async () => {
		await expect(
			consumeAgentTurn({
				auth: {} as never,
				env: AppEnv.Sandbox,
				logger,
				orgId: "org_1",
				session: makeSession(),
				token: "t",
			}),
		).rejects.toBeInstanceOf(MockEveSessionDeadError);
	});
});
