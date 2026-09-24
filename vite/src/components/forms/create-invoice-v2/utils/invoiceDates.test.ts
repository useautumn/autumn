import { describe, expect, test } from "bun:test";
import {
	calendarDaysToInvoiceDates,
	invoiceDatesToCalendarDays,
} from "./invoiceDates";

const issueDay = new Date(2026, 8, 7);
const dueDay = new Date(2026, 9, 14);
const now = new Date("2026-09-24T15:00:00.000Z");

describe("calendarDaysToInvoiceDates", () => {
	test("sends the picked days at midday UTC", () => {
		const dates = calendarDaysToInvoiceDates({ issueDay, dueDay, now });

		expect(new Date(dates.issueDate).toISOString()).toBe(
			"2026-09-07T12:00:00.000Z",
		);
		expect(new Date(dates.dueDate).toISOString()).toBe(
			"2026-10-14T12:00:00.000Z",
		);
	});

	test("caps an issue date of today at now", () => {
		const dates = calendarDaysToInvoiceDates({
			issueDay: new Date(2026, 8, 24),
			dueDay,
			now: new Date("2026-09-24T09:00:00.000Z"),
		});

		expect(new Date(dates.issueDate).toISOString()).toBe(
			"2026-09-24T09:00:00.000Z",
		);
	});
});

describe("invoiceDatesToCalendarDays", () => {
	test("round-trips to the picked calendar days", () => {
		const days = invoiceDatesToCalendarDays(
			calendarDaysToInvoiceDates({ issueDay, dueDay, now }),
		);

		expect(days.from.getTime()).toBe(issueDay.getTime());
		expect(days.to.getTime()).toBe(dueDay.getTime());
	});
});
