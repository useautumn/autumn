import { describe, expect, test } from "bun:test";
import { scheduleBillingCycleAnchorBounds } from "@/components/forms/create-schedule/utils/scheduleBillingCycleAnchorBounds";

const now = Date.UTC(2027, 0, 1);
const nextPhaseStart = Date.UTC(2027, 2, 1);
const endDate = Date.UTC(2027, 1, 1);

const phases = ({ firstStartsAt }: { firstStartsAt: number | null }) => [
	{ startsAt: firstStartsAt },
	{ startsAt: nextPhaseStart },
];

describe("scheduleBillingCycleAnchorBounds", () => {
	test("a first phase starting now allows a custom date from now", () => {
		expect(
			scheduleBillingCycleAnchorBounds({
				phases: phases({ firstStartsAt: now }),
				endDate: null,
				nowMs: now,
				hasActiveSubscription: false,
			}),
		).toEqual({ allowCustomAnchor: true, minUnixDate: now });
	});

	test("a first phase starting later allows no custom date", () => {
		expect(
			scheduleBillingCycleAnchorBounds({
				phases: phases({ firstStartsAt: Date.UTC(2027, 0, 20) }),
				endDate: null,
				nowMs: now,
				hasActiveSubscription: false,
			}).allowCustomAnchor,
		).toBe(false);
	});

	test("a live subscription caps the date at the next phase start", () => {
		expect(
			scheduleBillingCycleAnchorBounds({
				phases: phases({ firstStartsAt: null }),
				endDate: null,
				nowMs: now,
				hasActiveSubscription: true,
			}).maxUnixDate,
		).toBe(nextPhaseStart);
	});

	test("a new subscription is not capped by the next phase start", () => {
		expect(
			scheduleBillingCycleAnchorBounds({
				phases: phases({ firstStartsAt: null }),
				endDate: null,
				nowMs: now,
				hasActiveSubscription: false,
			}).maxUnixDate,
		).toBeUndefined();
	});

	test("the end date caps the date when it comes first", () => {
		expect(
			scheduleBillingCycleAnchorBounds({
				phases: phases({ firstStartsAt: null }),
				endDate,
				nowMs: now,
				hasActiveSubscription: true,
			}).maxUnixDate,
		).toBe(endDate);
	});
});
