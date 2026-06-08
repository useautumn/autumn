/**
 * Unit tests for getRcBasePrice — extracts an Autumn plan's flat base price as
 * RevenueCat micros + uppercased currency, or null for free / usage-only plans.
 */

import {
	BillingInterval,
	type FullProduct,
	type Organization,
	type Price,
	PriceType,
} from "@autumn/shared";
import { expect, test } from "bun:test";
import chalk from "chalk";
import { getRcBasePrice } from "@/external/revenueCat/sync/revenuecatProductSyncUtils.js";

const org = (currency = "usd") =>
	({ default_currency: currency }) as unknown as Organization;

const fixedPrice = (amount: number): Price =>
	({
		config: {
			type: PriceType.Fixed,
			amount,
			interval: BillingInterval.Month,
			interval_count: 1,
		},
	}) as unknown as Price;

const usagePrice = (): Price =>
	({
		config: {
			type: PriceType.Usage,
			bill_when: "end_of_period",
			usage_tiers: [{ to: -1, amount: 0.1 }],
			interval: BillingInterval.Month,
		},
	}) as unknown as Price;

const product = (prices: Price[]): FullProduct =>
	({ id: "pro", name: "Pro", prices }) as unknown as FullProduct;

test(`${chalk.yellowBright("getRcBasePrice: fixed price -> micros + uppercased currency")}`, () => {
	expect(getRcBasePrice({ product: product([fixedPrice(4.99)]), org: org() })).toEqual({
		amountMicros: 4_990_000,
		currency: "USD",
	});
});

test(`${chalk.yellowBright("getRcBasePrice: respects org currency, uppercased")}`, () => {
	expect(
		getRcBasePrice({ product: product([fixedPrice(9.99)]), org: org("eur") }),
	).toEqual({ amountMicros: 9_990_000, currency: "EUR" });
});

test(`${chalk.yellowBright("getRcBasePrice: usage-only plan -> null")}`, () => {
	expect(getRcBasePrice({ product: product([usagePrice()]), org: org() })).toBeNull();
});

test(`${chalk.yellowBright("getRcBasePrice: free plan (no prices) -> null")}`, () => {
	expect(getRcBasePrice({ product: product([]), org: org() })).toBeNull();
});

test(`${chalk.yellowBright("getRcBasePrice: zero-amount base -> null")}`, () => {
	expect(getRcBasePrice({ product: product([fixedPrice(0)]), org: org() })).toBeNull();
});
