import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	ErrCode,
	type Price,
	PriceType,
} from "@autumn/shared";
import { prices } from "@tests/utils/fixtures/db/prices";
import { prorateInvoiceLineAmount } from "@/internal/invoices/actions/create/compute/prorateInvoiceLineAmount";

const monthly = prices.createFixed({ id: "monthly" }); // $100 / month
const sep1 = Date.UTC(2026, 8, 1);
const sep16 = Date.UTC(2026, 8, 16);
const oct1 = Date.UTC(2026, 9, 1);
const nov15 = Date.UTC(2026, 10, 15);

const annual: Price = {
	...monthly,
	id: "annual",
	config: { ...monthly.config, interval: BillingInterval.Year },
};
const oneOff: Price = {
	...monthly,
	id: "one_off",
	config: { ...monthly.config, interval: BillingInterval.OneOff },
};

describe("prorateInvoiceLineAmount", () => {
	test("no period charges the full amount", () => {
		expect(prorateInvoiceLineAmount({ price: monthly, amount: 100 })).toBe(100);
	});

	test("half a month charges half", () => {
		expect(
			prorateInvoiceLineAmount({
				price: monthly,
				amount: 300,
				period: { start: sep1, end: sep16 },
			}),
		).toBeCloseTo(150, 2);
	});

	test("exactly one interval charges the full amount", () => {
		expect(
			prorateInvoiceLineAmount({
				price: monthly,
				amount: 300,
				period: { start: sep1, end: oct1 },
			}),
		).toBeCloseTo(300, 2);
	});

	test("a span over several intervals charges whole cycles plus the prorated remainder", () => {
		// Sep 1 → Nov 15: Sep + Oct in full, then 14 of 30 November days.
		expect(
			prorateInvoiceLineAmount({
				price: monthly,
				amount: 300,
				period: { start: sep1, end: nov15 },
			}),
		).toBeCloseTo(740, 2);
	});

	test("an annual price prorates a one-month span against the year", () => {
		expect(
			prorateInvoiceLineAmount({
				price: annual,
				amount: 365,
				period: { start: sep1, end: oct1 },
			}),
		).toBeCloseTo(30, 2);
	});

	test("a one-off price ignores the period", () => {
		expect(
			prorateInvoiceLineAmount({
				price: oneOff,
				amount: 50,
				period: { start: sep1, end: sep16 },
			}),
		).toBe(50);
	});

	test("a period that ends before it starts is rejected", () => {
		expect(() =>
			prorateInvoiceLineAmount({
				price: monthly,
				amount: 100,
				period: { start: sep16, end: sep1 },
			}),
		).toThrow(expect.objectContaining({ code: ErrCode.InvalidRequest }));
	});
});

describe("PriceType guard", () => {
	test("fixture sanity: monthly fixture is a fixed price", () => {
		expect(monthly.config.type).toBe(PriceType.Fixed);
	});
});
