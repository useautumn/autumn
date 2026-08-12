import { describe, expect, test } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";
import type { AutumnLogger } from "@autumn/logging";
import { denyExtraSuspendedCalls } from "../../../src/harness/claudeManaged/session/denyExtraSuspendedCalls.js";
import type { SessionTurnOutcome } from "../../../src/harness/common/types.js";

const testLogger = {
	child: () => testLogger,
	debug: () => {},
	error: () => {},
	info: () => {},
	warn: () => {},
	warning: () => {},
} as unknown as AutumnLogger;

const clientCapturingSends = (sends: unknown[], send?: () => Promise<void>) =>
	({
		beta: {
			sessions: {
				events: {
					send: async (_sessionId: string, body: { events: unknown[] }) => {
						sends.push(...body.events);
						await send?.();
					},
				},
			},
		},
	}) as unknown as Anthropic;

const suspendedOutcome = (
	queue: Array<{ toolCallId: string; toolName: string }>,
): SessionTurnOutcome => ({
	suspendedQueue: queue.map((call) => ({ ...call, args: {} })),
	textParts: [],
	usage: {
		cacheCreationInputTokens: 0,
		cacheReadInputTokens: 0,
		inputTokens: 0,
		outputTokens: 0,
	},
});

describe("denyExtraSuspendedCalls", () => {
	test("denies every suspended call after the first", async () => {
		const sends: unknown[] = [];
		const outcome = suspendedOutcome([
			{ toolCallId: "call_1", toolName: "attach" },
			{ toolCallId: "call_2", toolName: "updateSubscription" },
			{ toolCallId: "call_3", toolName: "createPlan" },
		]);

		await denyExtraSuspendedCalls({
			client: clientCapturingSends(sends),
			logger: testLogger,
			outcome,
			sessionId: "sesn_1",
		});

		expect(sends).toHaveLength(2);
		expect(sends).toEqual([
			{
				deny_message: expect.stringContaining("one gated write at a time"),
				result: "deny",
				tool_use_id: "call_2",
				type: "user.tool_confirmation",
			},
			{
				deny_message: expect.stringContaining("one gated write at a time"),
				result: "deny",
				tool_use_id: "call_3",
				type: "user.tool_confirmation",
			},
		]);
		expect(outcome.suspendedQueue).toEqual([
			{ args: {}, toolCallId: "call_1", toolName: "attach" },
		]);
	});

	test("leaves a single suspended call untouched", async () => {
		const sends: unknown[] = [];
		const outcome = suspendedOutcome([
			{ toolCallId: "call_1", toolName: "attach" },
		]);

		await denyExtraSuspendedCalls({
			client: clientCapturingSends(sends),
			logger: testLogger,
			outcome,
			sessionId: "sesn_1",
		});

		expect(sends).toEqual([]);
		expect(outcome.suspendedQueue).toHaveLength(1);
	});

	test("keeps the queue intact when the deny cannot be sent", async () => {
		const sends: unknown[] = [];
		const outcome = suspendedOutcome([
			{ toolCallId: "call_1", toolName: "attach" },
			{ toolCallId: "call_2", toolName: "createPlan" },
		]);

		await denyExtraSuspendedCalls({
			client: clientCapturingSends(sends, async () => {
				throw new Error("session unreachable");
			}),
			logger: testLogger,
			outcome,
			sessionId: "sesn_1",
		});

		expect(outcome.suspendedQueue).toHaveLength(2);
	});
});
