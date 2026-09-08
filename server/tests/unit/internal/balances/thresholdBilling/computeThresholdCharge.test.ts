import { describe, expect, test } from "bun:test";
import { computeThresholdCharge } from "@/internal/balances/thresholdBilling/compute/computeThresholdCharge";

describe("computeThresholdCharge", () => {
	test("charges exactly the threshold and leaves residual overage", () => {
		expect(
			computeThresholdCharge({ outstandingUnits: 140, threshold: 100 }),
		).toEqual({ chargeUnits: 100, remainingUnits: 40 });
	});

	test("does not charge below the threshold", () => {
		expect(
			computeThresholdCharge({ outstandingUnits: 99, threshold: 100 }),
		).toBeNull();
	});

	test("does not duplicate an in-flight threshold claim", () => {
		expect(
			computeThresholdCharge({
				outstandingUnits: 140,
				threshold: 100,
				claimedUnits: 100,
			}),
		).toBeNull();
	});

	test("allows a second threshold chunk after more usage arrives", () => {
		expect(
			computeThresholdCharge({
				outstandingUnits: 240,
				threshold: 100,
				claimedUnits: 100,
			}),
		).toEqual({ chargeUnits: 100, remainingUnits: 140 });
	});
});
