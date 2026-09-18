import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	ErrCode,
	type FixedPriceConfig,
} from "@autumn/shared";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import { resolveInvoiceBasePrice } from "@/internal/invoices/actions/create/compute/resolveInvoiceBasePrice";

const base = prices.createFixed({ id: "base" }); // $100 / month
const withBase = products.createFull({ id: "pro", prices: [base] });
const withoutBase = products.createFull({ id: "free", prices: [] });

describe("resolveInvoiceBasePrice", () => {
	test("the catalog base price is used by default", () => {
		const resolved = resolveInvoiceBasePrice({ product: withBase });
		expect(resolved?.price.id).toBe("base");
		expect(resolved?.amount).toBe(100);
	});

	test("a plan without a base price yields nothing", () => {
		expect(resolveInvoiceBasePrice({ product: withoutBase })).toBeUndefined();
	});

	test("customize.price null omits the base price", () => {
		expect(
			resolveInvoiceBasePrice({
				product: withBase,
				customize: { price: null },
			}),
		).toBeUndefined();
	});

	test("customize.price with amount 0 omits the base price", () => {
		expect(
			resolveInvoiceBasePrice({
				product: withBase,
				customize: { price: { amount: 0, interval: BillingInterval.Month } },
			}),
		).toBeUndefined();
	});

	test("customize.price overrides the amount for this invoice only", () => {
		const resolved = resolveInvoiceBasePrice({
			product: withBase,
			customize: { price: { amount: 80, interval: BillingInterval.Month } },
		});
		expect(resolved?.amount).toBe(80);
		expect(resolved?.price.config.interval).toBe(BillingInterval.Month);
		// catalog untouched
		expect((base.config as FixedPriceConfig).amount).toBe(100);
	});

	test("customize.price on a plan without a base price adds one", () => {
		const resolved = resolveInvoiceBasePrice({
			product: withoutBase,
			customize: { price: { amount: 25, interval: BillingInterval.Year } },
		});
		expect(resolved?.amount).toBe(25);
		expect(resolved?.price.config.interval).toBe(BillingInterval.Year);
	});

	test("a negative customized amount is rejected", () => {
		expect(() =>
			resolveInvoiceBasePrice({
				product: withBase,
				customize: { price: { amount: -5, interval: BillingInterval.Month } },
			}),
		).toThrow(expect.objectContaining({ code: ErrCode.InvalidRequest }));
	});
});
