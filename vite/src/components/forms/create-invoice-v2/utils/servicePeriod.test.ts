import { describe, expect, test } from "bun:test";
import {
	EMPTY_INVOICE_PLAN,
	type FormInvoicePlan,
} from "../createInvoiceFormSchema";
import {
	calendarDayToUtcDay,
	findPlansOutsideInvoicePeriod,
	formatServicePeriod,
	utcDayToCalendarDay,
	withPlanServicePeriod,
} from "./servicePeriod";

const OCT_1 = Date.UTC(2026, 9, 1);
const OCT_15 = Date.UTC(2026, 9, 15);
const NOV_1 = Date.UTC(2026, 10, 1);
const NOV_20 = Date.UTC(2026, 10, 20);

const plan = (
	_id: string,
	period: FormInvoicePlan["period"] = null,
): FormInvoicePlan => ({ ...EMPTY_INVOICE_PLAN, _id, planId: "pro", period });

describe("calendar days", () => {
	test("a picked calendar day is that day's UTC midnight, and back", () => {
		const picked = new Date(2026, 9, 15);
		expect(calendarDayToUtcDay(picked)).toBe(OCT_15);
		expect(utcDayToCalendarDay(OCT_15).getTime()).toBe(picked.getTime());
	});
});

describe("formatServicePeriod", () => {
	test("prints the year once within a year", () => {
		expect(formatServicePeriod({ start: OCT_1, end: OCT_15 })).toBe(
			"Oct 1 – Oct 15, 2026",
		);
	});

	test("prints both years across a year boundary", () => {
		expect(
			formatServicePeriod({
				start: Date.UTC(2026, 11, 15),
				end: Date.UTC(2027, 0, 1),
			}),
		).toBe("Dec 15, 2026 – Jan 1, 2027");
	});

	test("omits the year for the compact chip", () => {
		expect(
			formatServicePeriod({ start: OCT_15, end: NOV_1 }, { compact: true }),
		).toBe("Oct 15 – Nov 1");
	});
});

describe("withPlanServicePeriod", () => {
	test("sets a row's override", () => {
		expect(
			withPlanServicePeriod({
				plan: plan("a"),
				period: { start: OCT_1, end: OCT_15 },
			}).period,
		).toEqual({ start: OCT_1, end: OCT_15 });
	});

	test("clears a row's override", () => {
		const cleared = withPlanServicePeriod({
			plan: plan("a", { start: OCT_1, end: OCT_15 }),
			period: null,
		});
		expect(cleared.period).toBeNull();
		expect(cleared._id).toBe("a");
	});

	test("ignores a range that ends before it starts", () => {
		const original = plan("a", { start: OCT_1, end: OCT_15 });
		expect(
			withPlanServicePeriod({
				plan: original,
				period: { start: OCT_15, end: OCT_15 },
			}),
		).toBe(original);
	});
});

describe("findPlansOutsideInvoicePeriod", () => {
	const plans = [
		plan("inside", { start: OCT_1, end: OCT_15 }),
		plan("outside", { start: OCT_15, end: NOV_20 }),
		plan("inherits"),
	];

	test("names the rows whose override the server rejected", () => {
		expect(
			findPlansOutsideInvoicePeriod({
				errorMessage: `A line period (${OCT_15} to ${NOV_20}, unix ms) falls outside the invoice's period_start / period_end.`,
				plans,
			}),
		).toEqual(["outside"]);
	});

	test("names nothing for other errors", () => {
		expect(
			findPlansOutsideInvoicePeriod({
				errorMessage: "Entity workspace-z not found",
				plans,
			}),
		).toEqual([]);
		expect(
			findPlansOutsideInvoicePeriod({ errorMessage: null, plans }),
		).toEqual([]);
	});
});
