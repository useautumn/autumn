/** A new message detaches the card before steering Eve into a normal turn.
 * Cancelling the parked turn here was tried and reverted: it left the session
 * unable to park again, so the next gated write hung silently. */

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
const detachedRuns: string[] = [];
const cancelledSessions: string[] = [];
await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/client.js",
	factory: () => ({
		cancelEveTurn: async ({ session }: { session: { sessionId: string } }) => {
			cancelledSessions.push(session.sessionId);
		},
		postEveInputResponse: async (input: {
			optionId: string;
			requestId: string;
		}) => {
			postedMessages.push({
				inputResponses: [
					{ optionId: input.optionId, requestId: input.requestId },
				],
			});
			return { sessionId: "eve_session_1" };
		},
		postEveMessage: async (input: { message?: unknown }) => {
			postedMessages.push({ message: input.message });
			return { sessionId: "eve_session_1" };
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
await mockLeafModule({
	specifier: "../../../src/internal/approvals/repos/chatApprovalRepo.js",
	factory: () => ({
		chatApprovalRepo: {
			detachPendingForRun: async ({ runId }: { runId: string }) => {
				detachedRuns.push(runId);
			},
		},
	}),
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
		streamIndex: 7,
		pendingRequests: pending
			? [{ denyOptionId: "deny", kind: "gated", requestId: "tc_1" }]
			: [],
	},
	threadKey: "sandbox:slack:T1:C1:thread_1",
});

describe("startAgentTurn with a pending approval", () => {
	beforeEach(() => {
		cancelledSessions.length = 0;
		detachedRuns.length = 0;
		postedMessages.length = 0;
	});

	test("leaves the park intact so the session can still park again", async () => {
		const session = makeSession(true);
		await startAgentTurn({
			auth,
			env: AppEnv.Sandbox,
			message: "why is it $591?",
			orgId: "org_1",
			params: {} as never,
			session,
			thread,
		});

		expect(cancelledSessions).toEqual([]);
		expect(session.state.pendingRequests).toHaveLength(1);
		expect(postedMessages).toHaveLength(1);
		expect(postedMessages[0]).toEqual({ message: "why is it $591?" });
		expect(detachedRuns).toEqual(["eve_session_1"]);
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
			message: "hello",
		});
		expect(cancelledSessions).toEqual([]);
		expect(detachedRuns).toEqual(["eve_session_1"]);
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
		});
		expect(cancelledSessions).toEqual([]);
		expect(detachedRuns).toEqual([]);
	});
});
