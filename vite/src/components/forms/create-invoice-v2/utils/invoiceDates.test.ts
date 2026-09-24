import { describe, expect, test } from "bun:test";
import { invoiceDaysToParams } from "./invoiceDates";

const issueDay = new Date(2026, 8, 7).getTime();
const dueDay = new Date(2026, 9, 14).getTime();
const now = new Date(2026, 8, 24, 15);

describe("invoiceDaysToParams", () => {
	test("sends past issue and future due days at midday UTC", () => {
		const params = invoiceDaysToParams({ issueDay, dueDay, now });

		expect(new Date(params.issue_date ?? 0).toISOString()).toBe(
			"2026-09-07T12:00:00.000Z",
		);
		expect(new Date(params.due_date ?? 0).toISOString()).toBe(
			"2026-10-14T12:00:00.000Z",
		);
	});

	test("leaves an issue day of today to Stripe", () => {
		const params = invoiceDaysToParams({
			issueDay: new Date(2026, 8, 24).getTime(),
			dueDay,
			now,
		});

		expect(params).not.toHaveProperty("issue_date");
		expect(params).toHaveProperty("due_date");
	});

	test("sends nothing when no days are picked", () => {
		expect(invoiceDaysToParams({ issueDay: null, dueDay: null, now })).toEqual(
			{},
		);
	});
});
