import { describe, expect, test } from "bun:test";
import {
	billingCycleAnchorToKeepsCycleAnchor,
	phaseToBillingCycleAnchor,
} from "@/components/forms/create-schedule/utils/phaseBillingCycleAnchor";

describe("phaseToBillingCycleAnchor", () => {
	test("a later phase resets the billing cycle at its start by default", () => {
		expect(phaseToBillingCycleAnchor({ phase: {}, isFirstPhase: false })).toBe(
			"phase_start",
		);
	});

	test("a later phase that keeps its cycle anchor sends no anchor", () => {
		expect(
			phaseToBillingCycleAnchor({
				phase: { keepsCycleAnchor: true },
				isFirstPhase: false,
			}),
		).toBeUndefined();
	});

	test("the first phase never sends a phase anchor", () => {
		expect(
			phaseToBillingCycleAnchor({
				phase: { keepsCycleAnchor: false },
				isFirstPhase: true,
			}),
		).toBeUndefined();
	});
});

describe("billingCycleAnchorToKeepsCycleAnchor", () => {
	test("a later phase with a phase_start anchor resets", () => {
		expect(
			billingCycleAnchorToKeepsCycleAnchor({
				billingCycleAnchor: "phase_start",
				isFirstPhase: false,
			}),
		).toBe(false);
	});

	test("a later phase without an anchor keeps its cycle anchor", () => {
		expect(
			billingCycleAnchorToKeepsCycleAnchor({
				billingCycleAnchor: undefined,
				isFirstPhase: false,
			}),
		).toBe(true);
	});

	test("the first phase is never marked as keeping its cycle anchor", () => {
		expect(
			billingCycleAnchorToKeepsCycleAnchor({
				billingCycleAnchor: undefined,
				isFirstPhase: true,
			}),
		).toBe(false);
	});
});
