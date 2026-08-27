/**
 * Superseding a pending approval must not cost a separate eve turn: the deny
 * responses ride the SAME postEveMessage call as the user's new message, with
 * the withdrawal note prefixed, so the model pivots in one turn.
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

const postedMessages: Array<{
	inputResponses?: Array<{ optionId: string; requestId: string }>;
	message?: unknown;
}> = [];
await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/client.js",
	factory: () => ({
		postEveMessage: async (input: {
			inputResponses?: Array<{ optionId: string; requestId: string }>;
			message?: unknown;
		}) => {
			postedMessages.push({
				inputResponses: input.inputResponses,
				message: input.message,
			});
			return { continuationToken: "token_2", sessionId: "eve_session_1" };
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
	specifier: "../../../src/internal/agentRuntime/eve/repo.js",
	factory: () => ({ deleteEveSession: async () => undefined }),
});

const { startAgentTurn } = await import(
	"../../../src/internal/agentRuntime/actions/runAgentTurn/setup/startAgentTurn.js"
);

const auth = { token: "t" } as never;
const thread = {
	channelId: "C1",
	provider: "slack",
	threadId: "thread_1",
	workspaceId: "T1",
} as never;

const makeSession = (): EveSessionRef => ({
	env: AppEnv.Sandbox,
	newSession: false,
	sessionId: "eve_session_1",
	state: {
		continuationToken: "token_1",
		streamIndex: 7,
		pendingRequests: [],
	},
	threadKey: "sandbox:slack:T1:C1:thread_1",
});

describe("startAgentTurn withdrawal bundling", () => {
	beforeEach(() => {
		postedMessages.length = 0;
	});

	test("denies ride the same post as the new message, note prefixed", async () => {
		await startAgentTurn({
			auth,
			env: AppEnv.Sandbox,
			message: "actually make it 2k credits",
			orgId: "org_1",
			params: {} as never,
			session: makeSession(),
			thread,
			withdrawal: {
				inputResponses: [{ optionId: "deny", requestId: "tc_1" }],
				note: "(withdrawn — act on the new message)",
			},
		});

		expect(postedMessages).toHaveLength(1);
		const posted = postedMessages[0];
		expect(posted.inputResponses).toEqual([
			{ optionId: "deny", requestId: "tc_1" },
		]);
		expect(String(posted.message)).toContain(
			"(withdrawn — act on the new message)",
		);
		expect(String(posted.message)).toContain("actually make it 2k credits");
	});

	test("a plain follow-up sends only the message", async () => {
		await startAgentTurn({
			auth,
			env: AppEnv.Sandbox,
			message: "hello",
			orgId: "org_1",
			params: {} as never,
			session: makeSession(),
			thread,
		});

		expect(postedMessages[0]).toEqual({
			inputResponses: undefined,
			message: "hello",
		});
	});

	test("question-chip answers still send responses without a message", async () => {
		await startAgentTurn({
			auth,
			env: AppEnv.Sandbox,
			message: "ignored",
			orgId: "org_1",
			params: {
				questionResponse: { optionId: "opt_a", requestId: "q_1" },
			} as never,
			session: makeSession(),
			thread,
		});

		expect(postedMessages[0]).toEqual({
			inputResponses: [{ optionId: "opt_a", requestId: "q_1" }],
			message: undefined,
		});
	});
});
