import { expect, test } from "bun:test";
import { ms } from "@autumn/shared";
import {
	firstPhaseBackdatesLiveSubscription,
	firstPhaseStartsLater,
} from "@/components/forms/create-schedule/utils/schedulePhaseTiming";

const NOW = Date.UTC(2026, 9, 5, 12);

const backdates = ({
	startsAt,
	persistedStartsAt,
	isExistingSchedule = false,
	hasActiveSubscription = true,
}: {
	startsAt: number;
	persistedStartsAt?: number;
	isExistingSchedule?: boolean;
	hasActiveSubscription?: boolean;
}) =>
	firstPhaseBackdatesLiveSubscription({
		phases: [{ startsAt, persistedStartsAt }],
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

test("an existing schedule's started phase replaying its own start doesn't backdate", () => {
	const persistedStartsAt = NOW - ms.days(10);
	expect(
		backdates({
			startsAt: persistedStartsAt,
			persistedStartsAt,
			isExistingSchedule: true,
		}),
	).toBe(false);
	expect(
		backdates({
			startsAt: persistedStartsAt - ms.minutes(10),
			persistedStartsAt,
			isExistingSchedule: true,
		}),
	).toBe(false);
});

test("an existing schedule's started phase moved earlier than its start backdates the live subscription", () => {
	const persistedStartsAt = NOW - ms.days(10);
	expect(
		backdates({
			startsAt: persistedStartsAt - ms.days(20),
			persistedStartsAt,
			isExistingSchedule: true,
		}),
	).toBe(true);
});

test("an existing schedule that hasn't started yet never backdates", () => {
	const persistedStartsAt = NOW + ms.days(10);
	expect(
		backdates({
			startsAt: NOW + ms.days(2),
			persistedStartsAt,
			isExistingSchedule: true,
		}),
	).toBe(false);
});

test("without a live subscription there is nothing to backdate", () => {
	expect(
		backdates({ startsAt: NOW - ms.days(10), hasActiveSubscription: false }),
	).toBe(false);
});

const startsLater = ({ startsAt }: { startsAt: number }) =>
	firstPhaseStartsLater({ phases: [{ startsAt }], nowMs: NOW });

test("a first phase further ahead than the server's tolerance starts later", () => {
	expect(startsLater({ startsAt: NOW + ms.days(10) })).toBe(true);
});

test("a first phase within the server's tolerance ahead of now starts now, not later", () => {
	expect(startsLater({ startsAt: NOW + ms.minutes(10) })).toBe(false);
});
