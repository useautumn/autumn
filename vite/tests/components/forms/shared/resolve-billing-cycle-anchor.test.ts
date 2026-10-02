import { describe, expect, test } from "bun:test";
import { resolveBillingCycleAnchor } from "@/components/forms/shared/utils/resolveBillingCycleAnchor";

describe("resolveBillingCycleAnchor", () => {
	test("omits the anchor while the reset is disabled", () => {
		expect(
			resolveBillingCycleAnchor({
				resetBillingCycle: false,
				billingCycleAnchorMode: "custom",
				billingCycleAnchorDate: 1_788_220_800_000,
			}),
		).toBeUndefined();
	});

	test("returns now for the immediate mode", () => {
		expect(
			resolveBillingCycleAnchor({
				resetBillingCycle: true,
				billingCycleAnchorMode: "now",
				billingCycleAnchorDate: null,
			}),
		).toBe("now");
	});

	test("returns the selected custom timestamp", () => {
		expect(
			resolveBillingCycleAnchor({
				resetBillingCycle: true,
				billingCycleAnchorMode: "custom",
				billingCycleAnchorDate: 1_788_220_800_000,
			}),
		).toBe(1_788_220_800_000);
	});

	test("omits the top-level anchor when the cycle restarts on the first phase's start", () => {
		expect(
			resolveBillingCycleAnchor({
				resetBillingCycle: true,
				billingCycleAnchorMode: "phase_start",
				billingCycleAnchorDate: 1_788_220_800_000,
			}),
		).toBeUndefined();
	});
});
