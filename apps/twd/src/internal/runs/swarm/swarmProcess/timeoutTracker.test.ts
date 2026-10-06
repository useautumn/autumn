import { describe, expect, test } from "bun:test";
import { classifyFailedFile, createTimeoutTracker } from "./timeoutTracker.ts";

const BUN_OUTPUT = [
	"(pass) ok [0.45ms]",
	"[x] working",
	"(fail) slow [300000.99ms]",
	"  ^ this test timed out after 300000ms.",
	"",
].join("\n");

describe("createTimeoutTracker", () => {
	test("records bun's per-test timeout against the attempt that printed it", () => {
		const tracker = createTimeoutTracker();
		tracker.record({ file: "a.test.ts", attempt: 1, chunk: BUN_OUTPUT });
		expect([...tracker.timeouts({ file: "a.test.ts" })]).toEqual([
			[1, "timed out after 300000ms"],
		]);
		expect(tracker.timeouts({ file: "b.test.ts" }).size).toBe(0);
	});

	test("rejoins a marker split across chunks and ignores ANSI colour", () => {
		const tracker = createTimeoutTracker();
		tracker.record({
			file: "a.test.ts",
			attempt: 2,
			chunk: "\u001b[31m  ^ this test timed",
		});
		tracker.record({
			file: "a.test.ts",
			attempt: 2,
			chunk: " out after 5000ms.\u001b[39m\n",
		});
		expect(tracker.timeouts({ file: "a.test.ts" }).get(2)).toBe(
			"timed out after 5000ms",
		);
	});

	test("recognises a hook timeout", () => {
		const tracker = createTimeoutTracker();
		tracker.record({
			file: "a.test.ts",
			attempt: 1,
			chunk:
				"(fail) (unnamed) [300.18ms]\n  ^ a beforeEach/afterEach hook timed out for this test.\n",
		});
		expect(tracker.timeouts({ file: "a.test.ts" }).get(1)).toBe(
			"a beforeEach/afterEach hook timed out",
		);
	});

	test("a test's own 'timed out' message is not bun's timeout", () => {
		const tracker = createTimeoutTracker();
		tracker.record({
			file: "a.test.ts",
			attempt: 1,
			chunk:
				"error: Timed out after 120000ms waiting for webhook customer.subscription.updated\n(fail) webhook [120001ms]\n",
		});
		expect(tracker.timeouts({ file: "a.test.ts" }).size).toBe(0);
	});

	test("a new attempt never completes a marker the previous attempt started", () => {
		const tracker = createTimeoutTracker();
		tracker.record({
			file: "a.test.ts",
			attempt: 1,
			chunk: "  ^ this test timed",
		});
		tracker.record({
			file: "a.test.ts",
			attempt: 2,
			chunk: " out after 5000ms.\n",
		});
		expect(tracker.timeouts({ file: "a.test.ts" }).size).toBe(0);
	});
});

describe("classifyFailedFile", () => {
	const timeouts = (entries: [number, string][]) => new Map(entries);

	test("the final attempt timing out wins over assertion failures", () => {
		expect(
			classifyFailedFile({
				attempt: 2,
				verdicts: 4,
				crashed: false,
				timeouts: timeouts([[2, "timed out after 300000ms"]]),
			}),
		).toEqual({
			status: "timed_out",
			timeout: "timed out after 300000ms (attempt 2)",
		});
	});

	test("a silent retry after a timed-out first attempt is a timeout, not a crash", () => {
		expect(
			classifyFailedFile({
				attempt: 2,
				verdicts: 0,
				crashed: true,
				timeouts: timeouts([[1, "timed out after 300000ms"]]),
			}),
		).toEqual({
			status: "timed_out",
			timeout:
				"timed out after 300000ms (attempt 1); attempt 2 printed no results",
		});
	});

	test("a retry that failed on its own assertions stays failed", () => {
		expect(
			classifyFailedFile({
				attempt: 2,
				verdicts: 3,
				crashed: false,
				timeouts: timeouts([[1, "timed out after 300000ms"]]),
			}).status,
		).toBe("failed");
	});

	test("without any timeout, crash and failure keep their labels", () => {
		expect(
			classifyFailedFile({
				attempt: 2,
				verdicts: 0,
				crashed: true,
				timeouts: timeouts([]),
			}).status,
		).toBe("crashed");
		expect(
			classifyFailedFile({
				attempt: 1,
				verdicts: 2,
				crashed: false,
				timeouts: timeouts([]),
			}).status,
		).toBe("failed");
	});
});
