import { expect, test } from "bun:test";
import { ms } from "@autumn/shared";
import { firstPhaseBackdatesLiveSubscription } from "@/components/forms/create-schedule/utils/schedulePhaseTiming";

const NOW = Date.UTC(2026, 9, 5, 12);

const backdates = ({
	startsAt,
	isExistingSchedule = false,
	hasActiveSubscription = true,
}: {
	startsAt: number;
	isExistingSchedule?: boolean;
	hasActiveSubscription?: boolean;
}) =>
	firstPhaseBackdatesLiveSubscription({
		phases: [{ startsAt }],
		nowMs: NOW,
		isExistingSchedule,
		hasActiveSubscription,
	});

test("a first phase further back than the server's tolerance backdates the live subscription", () => {
	expect(backdates({ startsAt: NOW - ms.days(10) })).toBe(true);
});

test("a first phase within the server's tolerance of now starts now, not a backdate", () => {
	expect(backdates({ startsAt: NOW - ms.minutes(10) })).toBe(false);
});

test("an existing schedule's started phase never backdates", () => {
	expect(
		backdates({ startsAt: NOW - ms.days(10), isExistingSchedule: true }),
	).toBe(false);
});

test("without a live subscription there is nothing to backdate", () => {
	expect(
		backdates({ startsAt: NOW - ms.days(10), hasActiveSubscription: false }),
	).toBe(false);
});
