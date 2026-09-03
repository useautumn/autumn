import { describe, expect, test } from "bun:test";
import type { UsageAlertMeasurement } from "@/internal/balances/usageAlerts/check/types/usageAlertMeasurement.js";
import { wasThresholdCrossed } from "@/internal/balances/usageAlerts/check/wasThresholdCrossed.js";

const measurement = ({
	usage,
	denominator = 1000,
}: {
	usage: number;
	denominator?: number | null;
}): UsageAlertMeasurement => {
	const remaining = Math.max(0, (denominator ?? 0) - usage);
	return {
		usage,
		denominator,
		remaining,
		periodStartAt: null,
		payloadBlock: {
			basis: "balance",
			balance: {
				usage,
				granted: denominator ?? 0,
				included: denominator ?? 0,
				remaining,
			},
		},
	};
};

const crossed = ({
	threshold,
	thresholdType,
	before,
	after,
}: {
	threshold: number;
	thresholdType:
		| "usage"
		| "usage_percentage"
		| "remaining"
		| "remaining_percentage";
	before: UsageAlertMeasurement;
	after: UsageAlertMeasurement;
}) =>
	wasThresholdCrossed({
		alert: { threshold, threshold_type: thresholdType },
		before,
		after,
	});

describe("wasThresholdCrossed", () => {
	test("usage fires when the threshold is reached, not when already past", () => {
		expect(
			crossed({
				threshold: 500,
				thresholdType: "usage",
				before: measurement({ usage: 400 }),
				after: measurement({ usage: 500 }),
			}),
		).toBe(true);
		expect(
			crossed({
				threshold: 500,
				thresholdType: "usage",
				before: measurement({ usage: 600 }),
				after: measurement({ usage: 700 }),
			}),
		).toBe(false);
	});

	test("usage_percentage uses the measurement's denominator", () => {
		expect(
			crossed({
				threshold: 80,
				thresholdType: "usage_percentage",
				before: measurement({ usage: 700, denominator: 1300 }),
				after: measurement({ usage: 1100, denominator: 1300 }),
			}),
		).toBe(true);
		expect(
			crossed({
				threshold: 80,
				thresholdType: "usage_percentage",
				before: measurement({ usage: 700, denominator: 1800 }),
				after: measurement({ usage: 1100, denominator: 1800 }),
			}),
		).toBe(false);
	});

	test("percentage thresholds skip when the denominator is null", () => {
		expect(
			crossed({
				threshold: 50,
				thresholdType: "usage_percentage",
				before: measurement({ usage: 0, denominator: null }),
				after: measurement({ usage: 400, denominator: null }),
			}),
		).toBe(false);
		expect(
			crossed({
				threshold: 10,
				thresholdType: "remaining_percentage",
				before: measurement({ usage: 0, denominator: null }),
				after: measurement({ usage: 400, denominator: null }),
			}),
		).toBe(false);
	});

	test("remaining fires when remaining drops to or below the threshold", () => {
		expect(
			crossed({
				threshold: 200,
				thresholdType: "remaining",
				before: measurement({ usage: 700 }),
				after: measurement({ usage: 850 }),
			}),
		).toBe(true);
		expect(
			crossed({
				threshold: 200,
				thresholdType: "remaining",
				before: measurement({ usage: 850 }),
				after: measurement({ usage: 900 }),
			}),
		).toBe(false);
	});

	test("remaining_percentage fires on the way down only", () => {
		expect(
			crossed({
				threshold: 20,
				thresholdType: "remaining_percentage",
				before: measurement({ usage: 700 }),
				after: measurement({ usage: 850 }),
			}),
		).toBe(true);
		expect(
			crossed({
				threshold: 20,
				thresholdType: "remaining_percentage",
				before: measurement({ usage: 850 }),
				after: measurement({ usage: 700 }),
			}),
		).toBe(false);
	});

	test("every threshold type fires on the exact boundary and not one step past it", () => {
		const boundary = ({
			thresholdType,
			threshold,
			before,
			after,
		}: {
			thresholdType: Parameters<typeof crossed>[0]["thresholdType"];
			threshold: number;
			before: number;
			after: number;
		}) =>
			crossed({
				threshold,
				thresholdType,
				before: measurement({ usage: before }),
				after: measurement({ usage: after }),
			});

		expect(
			boundary({
				thresholdType: "usage",
				threshold: 500,
				before: 490,
				after: 500,
			}),
		).toBe(true);
		expect(
			boundary({
				thresholdType: "usage",
				threshold: 500,
				before: 500,
				after: 510,
			}),
		).toBe(false);
		expect(
			boundary({
				thresholdType: "usage_percentage",
				threshold: 100,
				before: 990,
				after: 1000,
			}),
		).toBe(true);
		expect(
			boundary({
				thresholdType: "usage_percentage",
				threshold: 100,
				before: 1000,
				after: 1010,
			}),
		).toBe(false);
		expect(
			boundary({
				thresholdType: "remaining",
				threshold: 200,
				before: 790,
				after: 800,
			}),
		).toBe(true);
		expect(
			boundary({
				thresholdType: "remaining",
				threshold: 200,
				before: 800,
				after: 810,
			}),
		).toBe(false);
		expect(
			boundary({
				thresholdType: "remaining_percentage",
				threshold: 20,
				before: 790,
				after: 800,
			}),
		).toBe(true);
		expect(
			boundary({
				thresholdType: "remaining_percentage",
				threshold: 20,
				before: 800,
				after: 810,
			}),
		).toBe(false);
	});

	test("a bulk step crosses every threshold it passes", () => {
		const before = measurement({ usage: 0 });
		const after = measurement({ usage: 1000 });
		expect(
			crossed({
				threshold: 80,
				thresholdType: "usage_percentage",
				before,
				after,
			}),
		).toBe(true);
		expect(
			crossed({
				threshold: 100,
				thresholdType: "usage_percentage",
				before,
				after,
			}),
		).toBe(true);
	});
});
