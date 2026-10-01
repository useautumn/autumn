import { describe, expect, test } from "bun:test";
import { shouldReportJobFailure } from "@/queue/retryBudget/shouldReportJobFailure.js";

const bounded = { kind: "bounded", maxReceiveCount: 5 } as const;

describe("shouldReportJobFailure", () => {
	test("reports immediately when the job won't be retried", () => {
		expect(
			shouldReportJobFailure({
				willRetry: false,
				receiveCount: 1,
				retryBudget: bounded,
			}),
		).toBe(true);
	});

	test("stays quiet on retried deliveries before the last", () => {
		for (const receiveCount of [1, 2, 3, 4]) {
			expect(
				shouldReportJobFailure({
					willRetry: true,
					receiveCount,
					retryBudget: bounded,
				}),
			).toBe(false);
		}
	});

	test("reports on the last delivery before the dead-letter queue", () => {
		expect(
			shouldReportJobFailure({
				willRetry: true,
				receiveCount: 5,
				retryBudget: bounded,
			}),
		).toBe(true);
	});

	test("without a dead-letter queue, reports the 3rd delivery then every 10th", () => {
		const reported = Array.from({ length: 30 }, (_, i) => i + 1).filter(
			(receiveCount) =>
				shouldReportJobFailure({
					willRetry: true,
					receiveCount,
					retryBudget: { kind: "unbounded" },
				}),
		);
		expect(reported).toEqual([3, 10, 20, 30]);
	});

	test("reports every failure when the budget or delivery count is unknown", () => {
		expect(
			shouldReportJobFailure({
				willRetry: true,
				receiveCount: 1,
				retryBudget: { kind: "unknown" },
			}),
		).toBe(true);
		expect(
			shouldReportJobFailure({
				willRetry: true,
				receiveCount: Number.NaN,
				retryBudget: bounded,
			}),
		).toBe(true);
	});
});
