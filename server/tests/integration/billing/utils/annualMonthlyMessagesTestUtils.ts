import { expect } from "bun:test";
import {
	addInterval,
	type AttachPreviewResponse,
	BillingInterval,
	type BillingPreviewResponse,
	formatMsToDate,
	ms,
	type ProductV2,
} from "@autumn/shared";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";

export const ANNUAL_MONTHLY_MESSAGES_PHASES = [
	{ annualAmount: 240, prepaidQuantity: 100 },
	{ annualAmount: 360, prepaidQuantity: 200 },
	{ annualAmount: 480, prepaidQuantity: 300 },
] as const;

export const PREPAID_MESSAGE_BILLING_UNITS = 100;
export const PREPAID_MESSAGE_PACK_PRICE = 10;
export const CONSUMABLE_MESSAGE_UNIT_PRICE = 0.1;

export const annualMonthlyMessagesPlan = ({
	id = "annual-monthly-messages",
}: {
	id?: string;
} = {}): ProductV2 =>
	products.base({
		id,
		items: [
			items.annualPrice({ price: 1 }),
			items.prepaidMessages({
				includedUsage: 0,
				billingUnits: PREPAID_MESSAGE_BILLING_UNITS,
				price: PREPAID_MESSAGE_PACK_PRICE,
			}),
			items.consumableMessages({
				includedUsage: 0,
				price: CONSUMABLE_MESSAGE_UNIT_PRICE,
			}),
		],
	});

export const annualMonthlyPhasePlan = ({
	planId,
	annualAmount,
	prepaidQuantity,
}: {
	planId: string;
	annualAmount: number;
	prepaidQuantity: number;
}) => ({
	plan_id: planId,
	customize: {
		price: itemsV2.annualPrice({ amount: annualAmount }),
	},
	feature_quantities: [
		{
			feature_id: TestFeature.Messages,
			quantity: prepaidQuantity,
		},
	],
});

export const prepaidMessagesAmount = ({ quantity }: { quantity: number }) =>
	new Decimal(quantity)
		.div(PREPAID_MESSAGE_BILLING_UNITS)
		.mul(PREPAID_MESSAGE_PACK_PRICE)
		.toDecimalPlaces(2)
		.toNumber();

export const consumableMessagesAmount = ({ usage }: { usage: number }) =>
	new Decimal(usage)
		.mul(CONSUMABLE_MESSAGE_UNIT_PRICE)
		.toDecimalPlaces(2)
		.toNumber();

export const countMonthlyPeriods = ({
	startsAt,
	currentEpochMs,
}: {
	startsAt: number;
	currentEpochMs: number;
}) => {
	let periodStart = startsAt;
	let periods = 0;

	while (periodStart < currentEpochMs) {
		periods += 1;
		periodStart = addInterval({
			from: periodStart,
			interval: BillingInterval.Month,
		});
	}

	return Math.max(periods, 1);
};

export const nextMonthlyBoundary = ({
	startsAt,
	currentEpochMs,
}: {
	startsAt: number;
	currentEpochMs: number;
}) =>
	addInterval({
		from: startsAt,
		interval: BillingInterval.Month,
		intervalCount: countMonthlyPeriods({ startsAt, currentEpochMs }),
	});

export const expectedAnnualMonthlyImmediateTotal = ({
	annualAmount,
	prepaidQuantity,
	startsAt,
	currentEpochMs,
}: {
	annualAmount: number;
	prepaidQuantity: number;
	startsAt: number;
	currentEpochMs: number;
}) =>
	new Decimal(annualAmount)
		.plus(
			new Decimal(prepaidMessagesAmount({ quantity: prepaidQuantity })).mul(
				countMonthlyPeriods({ startsAt, currentEpochMs }),
			),
		)
		.toDecimalPlaces(2)
		.toNumber();

const expectPeriod = ({
	actual,
	expected,
	toleranceMs = ms.seconds(10),
}: {
	actual?: { start: number; end: number };
	expected: { start: number; end: number };
	toleranceMs?: number;
}) => {
	expect(actual).toBeDefined();
	expect(Math.abs(actual!.start - expected.start)).toBeLessThan(toleranceMs);
	expect(Math.abs(actual!.end - expected.end)).toBeLessThan(toleranceMs);
};

const expectDescriptionPeriod = ({
	description,
	period,
}: {
	description: string;
	period: { start: number; end: number };
}) => {
	expect(description).toContain(`from ${formatMsToDate(period.start)}`);
	expect(description).toContain(`to ${formatMsToDate(period.end)}`);
};

export const expectAnnualMonthlyPreviewCorrect = ({
	preview,
	annualAmount,
	prepaidQuantity,
	startsAt,
	currentEpochMs,
}: {
	preview: BillingPreviewResponse | AttachPreviewResponse;
	annualAmount: number;
	prepaidQuantity: number;
	startsAt: number;
	currentEpochMs: number;
}) => {
	const monthlyCycles = countMonthlyPeriods({ startsAt, currentEpochMs });
	const prepaidTotal = prepaidMessagesAmount({ quantity: prepaidQuantity });
	const nextCycleStart = nextMonthlyBoundary({ startsAt, currentEpochMs });
	const expectedTotal = expectedAnnualMonthlyImmediateTotal({
		annualAmount,
		prepaidQuantity,
		startsAt,
		currentEpochMs,
	});

	expect(preview.subtotal).toBe(expectedTotal);
	expect(preview.total).toBe(expectedTotal);
	expect(preview.line_items.reduce((sum, item) => sum + item.total, 0)).toBe(
		preview.total,
	);

	const annualLine = preview.line_items.find((item) => item.feature_id === null);
	const prepaidLine = preview.line_items.find(
		(item) => item.feature_id === TestFeature.Messages,
	);
	expect(annualLine).toBeDefined();
	expect(prepaidLine).toBeDefined();

	const annualPeriod = {
		start: startsAt,
		end: addInterval({ from: startsAt, interval: BillingInterval.Year }),
	};
	const prepaidPeriod = { start: startsAt, end: nextCycleStart };

	expect(annualLine!.total).toBe(annualAmount);
	expect(annualLine!.subtotal).toBe(annualAmount);
	expectPeriod({ actual: annualLine!.period, expected: annualPeriod });
	expectDescriptionPeriod({
		description: annualLine!.description,
		period: annualPeriod,
	});

	expect(prepaidLine!.total).toBe(
		new Decimal(prepaidTotal).mul(monthlyCycles).toNumber(),
	);
	expect(prepaidLine!.quantity).toBe(prepaidQuantity);
	expectPeriod({ actual: prepaidLine!.period, expected: prepaidPeriod });
	expectDescriptionPeriod({
		description: prepaidLine!.description,
		period: prepaidPeriod,
	});

	const nextCycle = expectPreviewNextCycleCorrect({
		preview,
		startsAt: nextCycleStart,
		total: prepaidTotal,
	});
	expect(nextCycle?.subtotal).toBe(prepaidTotal);
	expect(nextCycle?.line_items.length).toBe(1);
	expect(nextCycle?.usage_line_items.length).toBe(1);
	expect(nextCycle?.usage_line_items[0]?.feature_id).toBe(TestFeature.Messages);
};

const lineAmount = (line: Stripe.InvoiceLineItem) =>
	new Decimal(line.amount).div(100).toDecimalPlaces(2).toNumber();

const linePeriod = (line: Stripe.InvoiceLineItem) => ({
	start: line.period.start * 1000,
	end: line.period.end * 1000,
});

const linesWithDuration = ({
	invoice,
	interval,
}: {
	invoice: Stripe.Invoice;
	interval: "month" | "year";
}) =>
	invoice.lines.data.filter((line) => {
		const duration = linePeriod(line).end - linePeriod(line).start;
		if (interval === "year") return duration > ms.days(300);
		return duration > ms.days(20) && duration <= ms.days(45);
	});

export const expectAnnualMonthlyStripeInvoiceCorrect = ({
	invoice,
	annualAmount,
	monthlyAmount,
	monthlyPeriods,
	expectedTotal,
}: {
	invoice: Stripe.Invoice;
	annualAmount?: number;
	monthlyAmount: number;
	monthlyPeriods: { start: number; end: number }[];
	expectedTotal: number;
}) => {
	expect(new Decimal(invoice.total).div(100).toNumber()).toBe(expectedTotal);

	if (annualAmount !== undefined) {
		const annualLines = linesWithDuration({ invoice, interval: "year" });
		expect(annualLines).toHaveLength(1);
		expect(lineAmount(annualLines[0]!)).toBe(annualAmount);
	}

	const monthlyLines = linesWithDuration({ invoice, interval: "month" }).filter(
		(line) => line.amount > 0,
	);
	expect(monthlyLines).toHaveLength(monthlyPeriods.length);

	for (const expectedPeriod of monthlyPeriods) {
		const line = monthlyLines.find((line) => {
			const period = linePeriod(line);
			return (
				Math.abs(period.start - expectedPeriod.start) < ms.minutes(1) &&
				Math.abs(period.end - expectedPeriod.end) < ms.minutes(1)
			);
		});

		expect(line).toBeDefined();
		expect(lineAmount(line!)).toBe(monthlyAmount);
	}
};

export const monthlyPeriodsFrom = ({
	startsAt,
	count,
}: {
	startsAt: number;
	count: number;
}) =>
	Array.from({ length: count }, (_, index) => {
		const start = addInterval({
			from: startsAt,
			interval: BillingInterval.Month,
			intervalCount: index,
		});
		return {
			start,
			end: addInterval({ from: start, interval: BillingInterval.Month }),
		};
	});
