import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { BatchResetQueueDepth } from "@/internal/balances/batchReset/concurrency/getBatchResetQueueDepth.js";
import { ResetJobV2ConfigSchema } from "@/internal/misc/resetJobV2/resetJobV2Schemas.js";
import { setResetJobV2ConfigForTesting } from "@/internal/misc/resetJobV2/resetJobV2Store.js";

import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

let depthResults: (number | null | "error")[] = [];
let depthCalls = 0;

await mockModuleWithRestore(
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
		config: {
			...ResetJobV2ConfigSchema.parse({ queueHighWaterMessages: 20 }),
			queueDepthPollMs: 1,
		},
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
	test("labels a prolonged barrier wait without claiming workers are stuck", async () => {
		setDepthSequence([0, 0]);
		const waitedMs = 30 * 60 * 1000 + 1;
		const now = spyOn(Date, "now").mockReturnValue(waitedMs);
		now.mockReturnValueOnce(0);
		const logError = spyOn(logger, "error").mockImplementation(() => {});

		try {
			await waitForQueueDrained({ logger, signal: liveSignal() });
			expect(depthCalls).toBe(2);
			expect(logError).toHaveBeenCalledTimes(1);
			expect(logError).toHaveBeenCalledWith(
				"[reset-cus-ents-v2] sweep barrier wait exceeded 30 minutes; waiting for consecutive empty queue reads",
				{
					error_type: "batch_reset_barrier_wait_exceeded",
					jobName: "reset-cus-ents-v2",
					data: { queueVisible: 0, queueInFlight: 0, waitedMs },
				},
			);
		} finally {
			now.mockRestore();
			logError.mockRestore();
		}
	});

	test("returns only after two consecutive zero reads", async () => {
		setDepthSequence([3, 0, 0]);
		await waitForQueueDrained({ logger, signal: liveSignal() });
		expect(depthCalls).toBe(3);
	});

	test("a non-zero read resets the consecutive-zero counter", async () => {
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
