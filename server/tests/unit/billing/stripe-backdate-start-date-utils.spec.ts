import { describe, expect, test } from "bun:test";
import { addInterval, BillingInterval, ms, type Price } from "@autumn/shared";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import {
	countBackdatedPeriodsForPrice,
	getBackdatedCycleCountForPrice,
	STRIPE_BACKDATE_INVOICE_LINE_ITEM_LIMIT,
} from "@/internal/billing/v2/utils/backdate/countBackdatedPeriods";
import {
	assertStripeBackdateInvoiceLineItemLimit,
	countStripeBackdateInvoiceLineItems,
} from "@/internal/billing/v2/utils/backdate/stripeBackdateInvoiceLimit";

const startsAt = Date.UTC(2026, 0, 1);

const dateAfterCycles = ({
	cycles,
	interval = BillingInterval.Month,
	intervalCount = 1,
}: {
	cycles: number;
	interval?: BillingInterval;
	intervalCount?: number;
}) =>
	addInterval({
		from: startsAt,
		interval,
		intervalCount: cycles * intervalCount,
	});

const fixedPrice = ({
	id,
	interval = BillingInterval.Month,
	intervalCount = 1,
}: {
	id: string;
	interval?: BillingInterval;
	intervalCount?: number;
}) => {
	const price = prices.createFixed({ id });
	price.config.interval = interval;
	price.config.interval_count = intervalCount;
	return price;
};

describe("stripe backdate start date utilities", () => {
	test("allows the earliest start date that creates exactly Stripe's line item limit", () => {
		const product = products.createFull({
			prices: [fixedPrice({ id: "monthly" })],
		});
		const currentEpochMs = dateAfterCycles({
			cycles: STRIPE_BACKDATE_INVOICE_LINE_ITEM_LIMIT,
		});

		expect(
			countStripeBackdateInvoiceLineItems({
				products: [product],
				startsAt,
				currentEpochMs,
			}),
		).toBe(STRIPE_BACKDATE_INVOICE_LINE_ITEM_LIMIT);
		expect(() =>
			assertStripeBackdateInvoiceLineItemLimit({
				products: [product],
				startsAt,
				currentEpochMs,
			}),
		).not.toThrow();
	});

	test("rejects a start date that would exceed Stripe's line item limit", () => {
		const product = products.createFull({
			prices: [fixedPrice({ id: "monthly" })],
		});
		const currentEpochMs = dateAfterCycles({
			cycles: STRIPE_BACKDATE_INVOICE_LINE_ITEM_LIMIT + 1,
		});

		expect(() =>
			assertStripeBackdateInvoiceLineItemLimit({
				products: [product],
				startsAt,
				currentEpochMs,
			}),
		).toThrow("at most 250 line items");
	});

	test("counts each recurring Stripe price toward the backdated invoice limit", () => {
		const product = products.createFull({
			prices: [
				fixedPrice({ id: "base" }),
				fixedPrice({ id: "addon" }),
				prices.createOneOff({ id: "setup" }) as Price,
			],
		});
		const currentEpochMs = dateAfterCycles({ cycles: 126 });

		expect(
			countStripeBackdateInvoiceLineItems({
				products: [product],
				startsAt,
				currentEpochMs,
			}),
		).toBe(252);
		expect(() =>
			assertStripeBackdateInvoiceLineItemLimit({
				products: [product],
				startsAt,
				currentEpochMs,
			}),
		).toThrow("at most 250 line items");
	});
});

describe("backdated cycle counting", () => {
	const monthly = fixedPrice({ id: "monthly" });

	test("counts one elapsed period part-way through the first cycle", () => {
		expect(
			countBackdatedPeriodsForPrice({
				price: monthly,
				startsAt,
				currentEpochMs: startsAt + ms.days(14),
			}),
		).toBe(1);
	});

	test("counts two elapsed periods once the second cycle has begun", () => {
		const intoSecondCycle =
			addInterval({ from: startsAt, interval: BillingInterval.Month }) +
			ms.days(14);
		expect(
			countBackdatedPeriodsForPrice({
				price: monthly,
				startsAt,
				currentEpochMs: intoSecondCycle,
			}),
		).toBe(2);
	});

	test("counts zero elapsed periods for a one-off price", () => {
		expect(
			countBackdatedPeriodsForPrice({
				price: prices.createOneOff({ id: "setup" }) as Price,
				startsAt,
				currentEpochMs: startsAt + ms.days(40),
			}),
		).toBe(0);
	});

	test("cycle count floors at 1 when nothing has elapsed yet", () => {
		expect(
			getBackdatedCycleCountForPrice({
				price: monthly,
				startsAt,
				currentEpochMs: startsAt - ms.days(5),
			}),
		).toBe(1);
	});

	test("cycle count reflects multiple elapsed periods", () => {
		const intoThirdCycle =
			addInterval({
				from: startsAt,
				interval: BillingInterval.Month,
				intervalCount: 2,
			}) + ms.days(14);
		expect(
			getBackdatedCycleCountForPrice({
				price: monthly,
				startsAt,
				currentEpochMs: intoThirdCycle,
			}),
		).toBe(3);
	});
});
