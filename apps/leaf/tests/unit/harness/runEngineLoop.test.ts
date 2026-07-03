import { describe, expect, test } from "bun:test";
import type { AppEnv } from "@autumn/shared";
import type { MessageContext } from "../../../src/agent/runMessage/types.js";
import { runEngineLoop } from "../../../src/harness/common/runEngineLoop.js";
import type { SessionTurnOutcome } from "../../../src/harness/common/types.js";
import {
	closeRun,
	registerRun,
} from "../../../src/internal/runs/runRegistry.js";
import { logger } from "../../../src/lib/logger.js";

const turnOutcome = (text: string): SessionTurnOutcome => ({
	textParts: [text],
	toolResults: [],
	usage: {
		cacheCreationInputTokens: 0,
		cacheReadInputTokens: 0,
		inputTokens: 0,
		outputTokens: 0,
	},
});

const makeContext = (overrides: Partial<MessageContext>): MessageContext => ({
	agentTools: { destructiveTools: new Set<string>() },
	env: "sandbox" as AppEnv,
	id: "run-1",
	logger,
	org: { id: "org_1" },
	providerUserId: "U1",
	thread: {
		channelId: "C1",
		provider: "slack",
		threadId: "171.001",
		workspaceId: "T1",
	},
	timestamp: Date.now(),
	token: "token",
	...overrides,
});

describe("runEngineLoop follow-up pump", () => {
	test("flushes queued follow-ups as one message and stops when the queue empties", async () => {
		const run = registerRun({
			key: "el1",
			kind: "message",
			ownerProviderUserId: "U1",
		});
		run.resolveSessionId("sesn_1");
		// The hang repro: two queued follow-ups answered by a single turn.
		run.injectFollowUp({ text: "second question" });
		run.injectFollowUp({ text: "third question" });
		const flushed: string[] = [];
		const posted: string[] = [];

		const output = await runEngineLoop({
			ctx: makeContext({
				onTurnComplete: (text) => {
					posted.push(text);
				},
				run,
			}),
			interrupt: () => {},
			newSession: true,
			params: { text: "first question" },
			runTurn: async ({ onTurnEnd }) => {
				let outcome = turnOutcome("answer one");
				while ((await onTurnEnd(outcome)) === "continue") {
					outcome = turnOutcome("answer two");
				}
				return outcome;
			},
			sendFollowUp: async ({ text }) => {
				flushed.push(text);
			},
			sessionId: "sesn_1",
		});

		expect(flushed).toEqual(["second question\n\nthird question"]);
		expect(posted).toEqual(["answer one"]);
		expect(output.text).toBe("answer two");
		expect(output.finishReason).toBe("stop");
		expect(run.closed).toBe(true);
		closeRun({ key: "el1", run });
	});

	test("interrupts only a turn in flight and rejects injects after close", async () => {
		const run = registerRun({
			key: "el2",
			kind: "message",
			ownerProviderUserId: "U1",
		});
		run.resolveSessionId("sesn_2");
		let interrupts = 0;

		await runEngineLoop({
			ctx: makeContext({ run }),
			interrupt: () => {
				interrupts += 1;
			},
			newSession: true,
			params: { text: "question" },
			runTurn: async ({ onTurnEnd }) => {
				run.injectFollowUp({ text: "pivot" });
				expect(interrupts).toBe(1);
				expect(await onTurnEnd(turnOutcome("aborted answer"))).toBe("continue");
				const second = turnOutcome("pivot answer");
				expect(await onTurnEnd(second)).toBe("stop");
				return second;
			},
			sendFollowUp: async () => {},
			sessionId: "sesn_2",
		});

		expect(interrupts).toBe(1);
		expect(() => run.injectFollowUp({ text: "late" })).toThrow(
			"Run is closing",
		);
		closeRun({ key: "el2", run });
	});

	test("a stopped run drops queued follow-ups instead of flushing them", async () => {
		const run = registerRun({
			key: "el3",
			kind: "message",
			ownerProviderUserId: "U1",
			sendInterrupt: async () => {},
		});
		run.resolveSessionId("sesn_3");
		const flushed: string[] = [];

		const output = await runEngineLoop({
			ctx: makeContext({ run }),
			interrupt: () => {},
			newSession: true,
			params: { text: "question" },
			runTurn: async ({ onTurnEnd }) => {
				run.injectFollowUp({ text: "follow-up" });
				await run.requestStop({ byUserId: "U9", reason: "user" });
				const outcome = turnOutcome("partial");
				expect(await onTurnEnd(outcome)).toBe("stop");
				return outcome;
			},
			sendFollowUp: async ({ text }) => {
				flushed.push(text);
			},
			sessionId: "sesn_3",
		});

		expect(flushed).toEqual([]);
		expect(output.finishReason).toBe("stopped");
		closeRun({ key: "el3", run });
	});
});
