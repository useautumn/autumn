/** A new message releases Eve's gate in the same post while the durable card stays pending. */

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
await mockLeafModule({
	specifier: "../../../src/internal/approvals/repos/chatApprovalRepo.js",
	factory: () => ({ chatApprovalRepo: { moveToRun: async () => undefined } }),
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
const makeSession = (pending = false): EveSessionRef => ({
	env: AppEnv.Sandbox,
	newSession: false,
	sessionId: "eve_session_1",
	state: {
		continuationToken: "token_1",
		streamIndex: 7,
		pendingRequests: pending
			? [{ denyOptionId: "deny", kind: "gated", requestId: "tc_1" }]
			: [],
	},
	threadKey: "sandbox:slack:T1:C1:thread_1",
});

describe("startAgentTurn with a pending approval", () => {
	beforeEach(() => {
		postedMessages.length = 0;
	});

	test("releases the gate alongside the new message without calling it withdrawn", async () => {
		await startAgentTurn({
			auth,
			env: AppEnv.Sandbox,
			message: "actually make it 2k credits",
			orgId: "org_1",
			params: {} as never,
			session: makeSession(true),
			thread,
		});

		expect(postedMessages).toHaveLength(1);
		expect(postedMessages[0]?.inputResponses).toEqual([
			{ optionId: "deny", requestId: "tc_1" },
		]);
		expect(String(postedMessages[0]?.message)).toContain("remains available");
		expect(String(postedMessages[0]?.message)).not.toContain("withdrawn");
		expect(String(postedMessages[0]?.message)).toContain(
			"actually make it 2k credits",
		);
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
