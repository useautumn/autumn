/**
 * Unit tests for the V2 reset scan gates (queue-depth backpressure).
 *
 * The gates import getBatchResetQueueDepth directly, so queue depth is
 * simulated with mock.module; poll cadence comes from the resetJobV2 edge
 * config via its testing setter.
 *
 * Contract under test:
 *   Gate A (waitForQueueBelowHighWater):
 *     - passes immediately when depth <= high water
 *     - blocks while depth > high water, resumes once it drains
 *     - fails open when no dedicated queue is configured (null depth)
 *     - fails open when the depth check throws
 *   Gate B (waitForQueueDrained):
 *     - requires TWO consecutive zero reads before returning (approximate
 *       SQS counts)
 *     - a non-zero read resets the consecutive-zero counter
 *     - fails open on null depth
 *     - respects an aborted signal
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { BatchResetQueueDepth } from "@/internal/balances/batchReset/concurrency/getBatchResetQueueDepth.js";
import { ResetJobV2ConfigSchema } from "@/internal/misc/resetJobV2/resetJobV2Schemas.js";
import { setResetJobV2ConfigForTesting } from "@/internal/misc/resetJobV2/resetJobV2Store.js";

// Queue of depth results the mocked getBatchResetQueueDepth serves in order,
// repeating the last entry. `null` = no dedicated queue; "error" = SQS throw.
let depthResults: (number | null | "error")[] = [];
let depthCalls = 0;

mock.module(
	"@/internal/balances/batchReset/concurrency/getBatchResetQueueDepth.js",
	() => ({
		getBatchResetQueueDepth: (): Promise<BatchResetQueueDepth | null> => {
			const index = Math.min(depthCalls, depthResults.length - 1);
			depthCalls++;
			const total = depthResults[index];
			if (total === "error") return Promise.reject(new Error("sqs down"));
			if (total === null) return Promise.resolve(null);
			return Promise.resolve({ visible: total, inFlight: 0, total });
		},
	}),
);

const { waitForQueueBelowHighWater, waitForQueueDrained } = await import(
	"@/internal/balances/batchReset/concurrency/batchResetScanGates.js"
);
const { logger } = await import("@/external/logtail/logtailUtils.js");

const setDepthSequence = (results: (number | null | "error")[]) => {
	depthResults = results;
	depthCalls = 0;
};

const liveSignal = () => new AbortController().signal;

beforeEach(() => {
	setResetJobV2ConfigForTesting({
		config: ResetJobV2ConfigSchema.parse({
			queueHighWaterMessages: 20,
			// Schema minimum; keeps blocked-gate tests reasonably fast.
			queueDepthPollMs: 1_000,
		}),
	});
});

describe("waitForQueueBelowHighWater (gate A)", () => {
	test("passes immediately when depth is at or below high water", async () => {
		setDepthSequence([20]);
		await waitForQueueBelowHighWater({ logger, signal: liveSignal() });
		expect(depthCalls).toBe(1);
	});

	test("blocks while above high water and resumes once drained", async () => {
		setDepthSequence([50, 30, 5]);
		await waitForQueueBelowHighWater({ logger, signal: liveSignal() });
		expect(depthCalls).toBe(3);
	});

	test("fails open when no dedicated queue is configured", async () => {
		setDepthSequence([null]);
		await waitForQueueBelowHighWater({ logger, signal: liveSignal() });
		expect(depthCalls).toBe(1);
	});

	test("fails open when the depth check throws", async () => {
		setDepthSequence(["error"]);
		await waitForQueueBelowHighWater({ logger, signal: liveSignal() });
		expect(depthCalls).toBe(1);
	});
});

describe("waitForQueueDrained (gate B)", () => {
	test("returns only after two consecutive zero reads", async () => {
		setDepthSequence([3, 0, 0]);
		await waitForQueueDrained({ logger, signal: liveSignal() });
		expect(depthCalls).toBe(3);
	});

	test("a non-zero read resets the consecutive-zero counter", async () => {
		// zero, blip back to non-zero, then two zeros required again
		setDepthSequence([0, 2, 0, 0]);
		await waitForQueueDrained({ logger, signal: liveSignal() });
		expect(depthCalls).toBe(4);
	});

	test("fails open when no dedicated queue is configured", async () => {
		setDepthSequence([null]);
		await waitForQueueDrained({ logger, signal: liveSignal() });
		expect(depthCalls).toBe(1);
	});

	test("returns promptly when the signal is already aborted", async () => {
		const controller = new AbortController();
		controller.abort();
		setDepthSequence([100]);
		await waitForQueueDrained({ logger, signal: controller.signal });
		expect(depthCalls).toBe(0);
	});
});
