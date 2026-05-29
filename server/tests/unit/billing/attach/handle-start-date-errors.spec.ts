import { describe, expect, test } from "bun:test";
import {
	type AttachBillingContext,
	type AttachParamsV1,
	addInterval,
	BillingInterval,
} from "@autumn/shared";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import { handleStartDateErrors } from "@/internal/billing/v2/actions/attach/errors/handleStartDateErrors";
import { STRIPE_BACKDATE_INVOICE_LINE_ITEM_LIMIT } from "@/internal/billing/v2/utils/stripeBackdateStartDateUtils";

const startsAt = Date.UTC(2026, 0, 1);

const buildContext = ({
	currentEpochMs,
	priceCount = 1,
	checkoutMode = null,
}: {
	currentEpochMs: number;
	priceCount?: number;
	checkoutMode?: "stripe_checkout" | null;
}) =>
	({
		currentEpochMs,
		attachProduct: products.createFull({
			prices: Array.from({ length: priceCount }, (_, index) =>
				prices.createFixed({ id: `price_${index}` }),
			),
		}),
		checkoutMode,
		trialContext: null,
	}) as unknown as AttachBillingContext;

const paramsWithStartsAt = (startsAt: number) =>
	({
		customer_id: "cus_backdate_limit",
		plan_id: "pro",
		starts_at: startsAt,
	}) as AttachParamsV1;

const dateAfterMonthlyCycles = (cycles: number) =>
	addInterval({
		from: startsAt,
		interval: BillingInterval.Month,
		intervalCount: cycles,
	});

describe("handleStartDateErrors", () => {
	test("allows the earliest backdate that stays within Stripe's invoice line item limit", () => {
		expect(() =>
			handleStartDateErrors({
				billingContext: buildContext({
					currentEpochMs: dateAfterMonthlyCycles(
						STRIPE_BACKDATE_INVOICE_LINE_ITEM_LIMIT,
					),
				}),
				params: paramsWithStartsAt(startsAt),
			}),
		).not.toThrow();
	});

	test("rejects backdates that would exceed Stripe's invoice line item limit", () => {
		expect(() =>
			handleStartDateErrors({
				billingContext: buildContext({
					currentEpochMs: dateAfterMonthlyCycles(
						STRIPE_BACKDATE_INVOICE_LINE_ITEM_LIMIT + 1,
					),
				}),
				params: paramsWithStartsAt(startsAt),
			}),
		).toThrow("at most 250 line items");
	});

	test("applies Stripe's invoice line item limit across all recurring prices", () => {
		expect(() =>
			handleStartDateErrors({
				billingContext: buildContext({
					currentEpochMs: dateAfterMonthlyCycles(126),
					priceCount: 2,
				}),
				params: paramsWithStartsAt(startsAt),
			}),
		).toThrow("at most 250 line items");
	});

	test("rejects a backdated checkout-required start at execution time", () => {
		expect(() =>
			handleStartDateErrors({
				billingContext: buildContext({
					currentEpochMs: dateAfterMonthlyCycles(1),
					checkoutMode: "stripe_checkout",
				}),
				params: paramsWithStartsAt(startsAt),
			}),
		).toThrow("Past starts_at cannot be used when Stripe Checkout is required");
	});

	test("skips the checkout-required guard during preview", () => {
		expect(() =>
			handleStartDateErrors({
				billingContext: buildContext({
					currentEpochMs: dateAfterMonthlyCycles(1),
					checkoutMode: "stripe_checkout",
				}),
				params: paramsWithStartsAt(startsAt),
				preview: true,
			}),
		).not.toThrow();
	});
});
