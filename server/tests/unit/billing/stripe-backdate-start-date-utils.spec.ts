import { describe, expect, test } from "bun:test";
import { addInterval, BillingInterval, type Price } from "@autumn/shared";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import {
	assertStripeBackdateInvoiceLineItemLimit,
	countStripeBackdateInvoiceLineItems,
	STRIPE_BACKDATE_INVOICE_LINE_ITEM_LIMIT,
} from "@/internal/billing/v2/utils/stripeBackdateStartDateUtils";

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
