import { describe, expect, test } from "bun:test";
import {
	calendarDaysToInvoicePeriod,
	invoicePeriodToCalendarDays,
} from "./invoicePeriodDays";

const pickedFrom = new Date(2026, 8, 1);
const pickedTo = new Date(2026, 8, 15);

describe("calendarDaysToInvoicePeriod", () => {
	test("bills the picked days from UTC midnight to the end of the last UTC day", () => {
		const period = calendarDaysToInvoicePeriod({
			from: pickedFrom,
			to: pickedTo,
		});

		expect(new Date(period.start).toISOString()).toBe(
			"2026-09-01T00:00:00.000Z",
		);
		expect(new Date(period.end).toISOString()).toBe("2026-09-15T23:59:59.999Z");
	});

	test("a single picked day covers that whole UTC day", () => {
		const period = calendarDaysToInvoicePeriod({
			from: pickedFrom,
			to: pickedFrom,
		});

		expect(new Date(period.end).toISOString()).toBe("2026-09-01T23:59:59.999Z");
	});
});

describe("invoicePeriodToCalendarDays", () => {
	test("round-trips to the same calendar days that were picked", () => {
		const days = invoicePeriodToCalendarDays(
			calendarDaysToInvoicePeriod({ from: pickedFrom, to: pickedTo }),
		);

		expect(days.from.getTime()).toBe(pickedFrom.getTime());
		expect(days.to.getTime()).toBe(pickedTo.getTime());
	});
});
