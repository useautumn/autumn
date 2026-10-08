import { describe, expect, test } from "bun:test";
import { BillingMethod, type ProductItem, UsageModel } from "@autumn/shared";
import {
	EMPTY_INVOICE_PLAN,
	type FormInvoicePlan,
} from "../createInvoiceFormSchema";
import {
	applyServicePeriod,
	calendarDayToUtcDay,
	findPlansOutsideInvoicePeriod,
	formatServicePeriod,
	listServicePeriodTargets,
	servicePeriodForTarget,
	utcDayToCalendarDay,
} from "./servicePeriod";

const OCT_1 = Date.UTC(2026, 9, 1);
const OCT_15 = Date.UTC(2026, 9, 15);
const NOV_1 = Date.UTC(2026, 10, 1);
const NOV_20 = Date.UTC(2026, 10, 20);

const OCT_20 = Date.UTC(2026, 9, 20);

const plan = (
	_id: string,
	period: FormInvoicePlan["period"] = null,
	featurePeriods: FormInvoicePlan["featurePeriods"] = {},
): FormInvoicePlan => ({
	...EMPTY_INVOICE_PLAN,
	_id,
	planId: "pro",
	period,
	featurePeriods,
});

const items = [
	{ price: 100, interval: "month" },
	{ feature_id: "messages", usage_model: UsageModel.PayPerUse, price: 0.01 },
	{ feature_id: "credits", usage_model: UsageModel.Prepaid, price: 10 },
	{ feature_id: "credits", usage_model: UsageModel.PayPerUse, price: 0.2 },
	{ feature_id: "seats", included_usage: 5 },
] as ProductItem[];

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

describe("listServicePeriodTargets", () => {
	test("offers all prices, the base price, then each priced feature with its behaviours", () => {
		expect(listServicePeriodTargets({ items })).toEqual([
			{ kind: "all" },
			{ kind: "base" },
			{
				kind: "feature",
				featureId: "messages",
				behaviors: [BillingMethod.UsageBased],
			},
			{
				kind: "feature",
				featureId: "credits",
				behaviors: [BillingMethod.Prepaid, BillingMethod.UsageBased],
			},
		]);
	});
});

describe("applyServicePeriod", () => {
	const messages = {
		kind: "feature",
		featureId: "messages",
		behavior: BillingMethod.UsageBased,
	} as const;

	test("all prices sets the plan period and clears every item override", () => {
		const applied = applyServicePeriod({
			plan: plan("a", null, {
				"messages:usage_based": { start: OCT_1, end: OCT_15 },
			}),
			target: { kind: "all" },
			period: { start: OCT_1, end: NOV_1 },
		});
		expect(applied.period).toEqual({ start: OCT_1, end: NOV_1 });
		expect(applied.featurePeriods).toEqual({});
	});

	test("the base price keeps item overrides", () => {
		const overrides = { "messages:usage_based": { start: OCT_1, end: OCT_15 } };
		const applied = applyServicePeriod({
			plan: plan("a", null, overrides),
			target: { kind: "base" },
			period: { start: OCT_1, end: NOV_1 },
		});
		expect(applied.period).toEqual({ start: OCT_1, end: NOV_1 });
		expect(applied.featurePeriods).toEqual(overrides);
	});

	test("a feature sets and clears only its own behaviour's period", () => {
		const set = applyServicePeriod({
			plan: plan("a", { start: OCT_1, end: NOV_1 }),
			target: messages,
			period: { start: OCT_15, end: NOV_1 },
		});
		expect(set.period).toEqual({ start: OCT_1, end: NOV_1 });
		expect(set.featurePeriods).toEqual({
			"messages:usage_based": { start: OCT_15, end: NOV_1 },
		});

		const cleared = applyServicePeriod({
			plan: set,
			target: messages,
			period: null,
		});
		expect(cleared.featurePeriods).toEqual({});
		expect(cleared.period).toEqual({ start: OCT_1, end: NOV_1 });
	});

	test("ignores a range that ends before it starts", () => {
		const original = plan("a", { start: OCT_1, end: OCT_15 });
		expect(
			applyServicePeriod({
				plan: original,
				target: { kind: "base" },
				period: { start: OCT_15, end: OCT_15 },
			}),
		).toBe(original);
	});
});

describe("servicePeriodForTarget", () => {
	const saved = plan(
		"a",
		{ start: OCT_1, end: NOV_1 },
		{
			"credits:prepaid": { start: OCT_1, end: OCT_20 },
		},
	);

	test("prefills the plan period for all prices and the base price", () => {
		expect(
			servicePeriodForTarget({ plan: saved, target: { kind: "all" } }),
		).toEqual({ start: OCT_1, end: NOV_1 });
		expect(
			servicePeriodForTarget({ plan: saved, target: { kind: "base" } }),
		).toEqual({ start: OCT_1, end: NOV_1 });
	});

	test("prefills a feature's own period, else nothing", () => {
		expect(
			servicePeriodForTarget({
				plan: saved,
				target: {
					kind: "feature",
					featureId: "credits",
					behavior: BillingMethod.Prepaid,
				},
			}),
		).toEqual({ start: OCT_1, end: OCT_20 });
		expect(
			servicePeriodForTarget({
				plan: saved,
				target: {
					kind: "feature",
					featureId: "credits",
					behavior: BillingMethod.UsageBased,
				},
			}),
		).toBeNull();
	});
});

describe("findPlansOutsideInvoicePeriod", () => {
	const plans = [
		plan("inside", { start: OCT_1, end: OCT_15 }),
		plan("outside", { start: OCT_15, end: NOV_20 }),
		plan("inherits"),
		plan("item-outside", null, {
			"messages:usage_based": { start: OCT_15, end: NOV_20 },
		}),
	];

	test("names the rows whose override the server rejected", () => {
		expect(
			findPlansOutsideInvoicePeriod({
				errorMessage: `A line period (${OCT_15} to ${NOV_20}, unix ms) falls outside the invoice's period_start / period_end.`,
				plans,
			}),
		).toEqual(["outside", "item-outside"]);
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
