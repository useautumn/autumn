import { expect, test } from "bun:test";
import { ms } from "@autumn/shared";
import { phaseDatePickerLimits } from "@/components/forms/create-schedule/components/phase/PhaseDateControl";

const NOW = Date.UTC(2026, 9, 5, 12);
const PERSISTED_START = NOW - ms.days(10);

test("a started phase that can backdate may only move earlier than its start", () => {
	expect(
		phaseDatePickerLimits({
			nowMs: NOW,
			hasStarted: true,
			canBackdate: true,
			persistedStartsAt: PERSISTED_START,
		}),
	).toMatchObject({
		disabled: false,
		disablePastDates: false,
		minUnixDate: undefined,
		maxUnixDate: PERSISTED_START,
	});
});

test("a started phase that can't backdate stays locked", () => {
	expect(
		phaseDatePickerLimits({
			nowMs: NOW,
			hasStarted: true,
			canBackdate: false,
			persistedStartsAt: PERSISTED_START,
		}),
	).toMatchObject({ disabled: true, maxUnixDate: undefined });
});

test("a phase that hasn't started picks future dates unless it can backdate", () => {
	expect(
		phaseDatePickerLimits({
			nowMs: NOW,
			hasStarted: false,
			canBackdate: false,
		}),
	).toMatchObject({
		disabled: false,
		disablePastDates: true,
		minUnixDate: NOW,
		maxUnixDate: undefined,
	});
	expect(
		phaseDatePickerLimits({
			nowMs: NOW,
			hasStarted: false,
			canBackdate: true,
		}),
	).toMatchObject({
		disabled: false,
		disablePastDates: false,
		minUnixDate: undefined,
		maxUnixDate: undefined,
	});
});
