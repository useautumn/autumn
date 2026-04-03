import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	BillingType,
	Infinite,
	type Price,
	isProductUpgrade,
} from "@autumn/shared";

const createFixedPrice = ({
	amount,
	interval,
	intervalCount,
}: {
	amount: number;
	interval: BillingInterval;
	intervalCount?: number;
}): Price =>
	({
		id: "fixed-price",
		internal_product_id: "test-product",
		billing_type: BillingType.FixedCycle,
		config: {
			type: "fixed",
			amount,
			interval,
			interval_count: intervalCount,
		},
	}) as unknown as Price;

const createConsumablePrice = ({
	tierAmount = 0.1,
	interval = BillingInterval.Month,
}: {
	tierAmount?: number;
	interval?: BillingInterval;
} = {}): Price =>
	({
		id: "consumable-price",
		internal_product_id: "test-product",
		billing_type: BillingType.UsageInArrear,
		config: {
			type: "usage",
			bill_when: "end_of_period",
			internal_feature_id: "feat-1",
			feature_id: "messages",
			interval,
			usage_tiers: [{ to: Infinite, amount: tierAmount }],
		},
	}) as unknown as Price;

const createPrepaidPrice = ({
	tierAmount = 10,
	interval = BillingInterval.Month,
}: {
	tierAmount?: number;
	interval?: BillingInterval;
} = {}): Price =>
	({
		id: "prepaid-price",
		internal_product_id: "test-product",
		billing_type: BillingType.UsageInAdvance,
		config: {
			type: "usage",
			bill_when: "start_of_period",
			internal_feature_id: "feat-2",
			feature_id: "words",
			interval,
			usage_tiers: [{ to: Infinite, amount: tierAmount }],
		},
	}) as unknown as Price;

const createAllocatedPrice = ({
	tierAmount = 10,
	interval = BillingInterval.Month,
}: {
	tierAmount?: number;
	interval?: BillingInterval;
} = {}): Price =>
	({
		id: "allocated-price",
		internal_product_id: "test-product",
		billing_type: BillingType.InArrearProrated,
		config: {
			type: "usage",
			bill_when: "end_of_period",
			internal_feature_id: "feat-3",
			feature_id: "users",
			interval,
			should_prorate: true,
			usage_tiers: [{ to: Infinite, amount: tierAmount }],
		},
	}) as unknown as Price;

describe("isProductUpgrade", () => {
	describe("same interval", () => {
		test("$20/mo to $50/mo = upgrade", () => {
			const prices1 = [
				createFixedPrice({
					amount: 20,
					interval: BillingInterval.Month,
				}),
			];
			const prices2 = [
				createFixedPrice({
					amount: 50,
					interval: BillingInterval.Month,
				}),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(true);
		});

		test("$50/mo to $20/mo = downgrade", () => {
			const prices1 = [
				createFixedPrice({
					amount: 50,
					interval: BillingInterval.Month,
				}),
			];
			const prices2 = [
				createFixedPrice({
					amount: 20,
					interval: BillingInterval.Month,
				}),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(false);
		});

		test("$20/mo to $20/mo = upgrade (same = upgrade)", () => {
			const prices1 = [
				createFixedPrice({
					amount: 20,
					interval: BillingInterval.Month,
				}),
			];
			const prices2 = [
				createFixedPrice({
					amount: 20,
					interval: BillingInterval.Month,
				}),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(true);
		});
	});

	describe("cross interval (normalized to monthly rate)", () => {
		test("$200/yr to $20/mo = upgrade ($16.67/mo <= $20/mo)", () => {
			const prices1 = [
				createFixedPrice({
					amount: 200,
					interval: BillingInterval.Year,
				}),
			];
			const prices2 = [
				createFixedPrice({
					amount: 20,
					interval: BillingInterval.Month,
				}),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(true);
		});

		test("$300/yr to $20/mo = downgrade ($25/mo > $20/mo)", () => {
			const prices1 = [
				createFixedPrice({
					amount: 300,
					interval: BillingInterval.Year,
				}),
			];
			const prices2 = [
				createFixedPrice({
					amount: 20,
					interval: BillingInterval.Month,
				}),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(false);
		});

		test("$60/quarter to $20/mo = upgrade ($20/mo <= $20/mo)", () => {
			const prices1 = [
				createFixedPrice({
					amount: 60,
					interval: BillingInterval.Quarter,
				}),
			];
			const prices2 = [
				createFixedPrice({
					amount: 20,
					interval: BillingInterval.Month,
				}),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(true);
		});

		test("$20/mo to $500/yr = upgrade (larger interval always upgrade, even if expensive)", () => {
			const prices1 = [
				createFixedPrice({
					amount: 20,
					interval: BillingInterval.Month,
				}),
			];
			const prices2 = [
				createFixedPrice({
					amount: 500,
					interval: BillingInterval.Year,
				}),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(true);
		});

		test("$20/mo to $200/yr = upgrade (larger interval always upgrade)", () => {
			const prices1 = [
				createFixedPrice({
					amount: 20,
					interval: BillingInterval.Month,
				}),
			];
			const prices2 = [
				createFixedPrice({
					amount: 200,
					interval: BillingInterval.Year,
				}),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(true);
		});

		test("$5/week to $20/mo = upgrade ($20/mo <= $20/mo)", () => {
			const prices1 = [
				createFixedPrice({
					amount: 5,
					interval: BillingInterval.Week,
				}),
			];
			const prices2 = [
				createFixedPrice({
					amount: 20,
					interval: BillingInterval.Month,
				}),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(true);
		});

		test("$20/mo to $5/week = downgrade ($20/mo > $20/mo is false, so upgrade)", () => {
			const prices1 = [
				createFixedPrice({
					amount: 20,
					interval: BillingInterval.Month,
				}),
			];
			const prices2 = [
				createFixedPrice({
					amount: 5,
					interval: BillingInterval.Week,
				}),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(true);
		});

		test("$120/semi-annual to $20/mo = upgrade ($20/mo <= $20/mo)", () => {
			const prices1 = [
				createFixedPrice({
					amount: 120,
					interval: BillingInterval.SemiAnnual,
				}),
			];
			const prices2 = [
				createFixedPrice({
					amount: 20,
					interval: BillingInterval.Month,
				}),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(true);
		});

		test("$40/2mo to $20/mo = upgrade ($20/mo <= $20/mo)", () => {
			const prices1 = [
				createFixedPrice({
					amount: 40,
					interval: BillingInterval.Month,
					intervalCount: 2,
				}),
			];
			const prices2 = [
				createFixedPrice({
					amount: 20,
					interval: BillingInterval.Month,
				}),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(true);
		});

		test("$240/yr to $20/mo = upgrade ($20/mo <= $20/mo)", () => {
			const prices1 = [
				createFixedPrice({
					amount: 240,
					interval: BillingInterval.Year,
				}),
			];
			const prices2 = [
				createFixedPrice({
					amount: 20,
					interval: BillingInterval.Month,
				}),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(true);
		});

		test("$250/yr to $20/mo = downgrade ($20.83/mo > $20/mo)", () => {
			const prices1 = [
				createFixedPrice({
					amount: 250,
					interval: BillingInterval.Year,
				}),
			];
			const prices2 = [
				createFixedPrice({
					amount: 20,
					interval: BillingInterval.Month,
				}),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(false);
		});
	});

	describe("free product edge cases", () => {
		test("free (no prices) to free (no prices) = upgrade", () => {
			expect(isProductUpgrade({ prices1: [], prices2: [] })).toBe(true);
		});

		test("free to paid = upgrade", () => {
			const prices2 = [
				createFixedPrice({
					amount: 20,
					interval: BillingInterval.Month,
				}),
			];
			expect(isProductUpgrade({ prices1: [], prices2 })).toBe(true);
		});

		test("paid to free = downgrade", () => {
			const prices1 = [
				createFixedPrice({
					amount: 20,
					interval: BillingInterval.Month,
				}),
			];
			expect(isProductUpgrade({ prices1, prices2: [] })).toBe(false);
		});
	});

	describe("consumable-only products", () => {
		test("both all-consumable = upgrade (usageAlwaysUpgrade default)", () => {
			const prices1 = [createConsumablePrice({ tierAmount: 0.1 })];
			const prices2 = [createConsumablePrice({ tierAmount: 0.05 })];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(true);
		});

		test("both all-consumable with usageAlwaysUpgrade=false falls through to base price comparison", () => {
			const prices1 = [createConsumablePrice({ tierAmount: 0.1 })];
			const prices2 = [createConsumablePrice({ tierAmount: 0.05 })];
			expect(
				isProductUpgrade({
					prices1,
					prices2,
					usageAlwaysUpgrade: false,
				}),
			).toBe(true);
		});
	});

	describe("no base price (usage-only with fixed)", () => {
		test("no base price on either side = upgrade", () => {
			const prices1 = [createConsumablePrice()];
			const fixedZero = createFixedPrice({
				amount: 0,
				interval: BillingInterval.Month,
			});
			const prices2 = [createConsumablePrice(), fixedZero];
			expect(
				isProductUpgrade({
					prices1,
					prices2,
					usageAlwaysUpgrade: false,
				}),
			).toBe(true);
		});
	});

	describe("$0 base price transitions", () => {
		test("free (no prices) to $0/mo + usage = upgrade", () => {
			const prices2 = [
				createFixedPrice({
					amount: 0,
					interval: BillingInterval.Month,
				}),
				createConsumablePrice(),
			];
			expect(isProductUpgrade({ prices1: [], prices2 })).toBe(true);
		});

		test("$0/mo to $0/mo = upgrade (same normalized rate)", () => {
			const prices1 = [
				createFixedPrice({
					amount: 0,
					interval: BillingInterval.Month,
				}),
			];
			const prices2 = [
				createFixedPrice({
					amount: 0,
					interval: BillingInterval.Month,
				}),
				createConsumablePrice(),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(true);
		});

		test("$0/mo to $20/mo = upgrade", () => {
			const prices1 = [
				createFixedPrice({
					amount: 0,
					interval: BillingInterval.Month,
				}),
			];
			const prices2 = [
				createFixedPrice({
					amount: 20,
					interval: BillingInterval.Month,
				}),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(true);
		});

		test("$20/mo to $0/mo = downgrade", () => {
			const prices1 = [
				createFixedPrice({
					amount: 20,
					interval: BillingInterval.Month,
				}),
			];
			const prices2 = [
				createFixedPrice({
					amount: 0,
					interval: BillingInterval.Month,
				}),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(false);
		});
	});

	describe("products with prepaid prices", () => {
		test("$20/mo + prepaid to $50/mo + prepaid = upgrade (only base price matters)", () => {
			const prices1 = [
				createFixedPrice({ amount: 20, interval: BillingInterval.Month }),
				createPrepaidPrice({ tierAmount: 10 }),
			];
			const prices2 = [
				createFixedPrice({ amount: 50, interval: BillingInterval.Month }),
				createPrepaidPrice({ tierAmount: 5 }),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(true);
		});

		test("$50/mo + prepaid to $20/mo + prepaid = downgrade", () => {
			const prices1 = [
				createFixedPrice({ amount: 50, interval: BillingInterval.Month }),
				createPrepaidPrice({ tierAmount: 5 }),
			];
			const prices2 = [
				createFixedPrice({ amount: 20, interval: BillingInterval.Month }),
				createPrepaidPrice({ tierAmount: 10 }),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(false);
		});

		test("$200/yr + prepaid to $20/mo + prepaid = upgrade (normalized)", () => {
			const prices1 = [
				createFixedPrice({ amount: 200, interval: BillingInterval.Year }),
				createPrepaidPrice({ tierAmount: 10 }),
			];
			const prices2 = [
				createFixedPrice({ amount: 20, interval: BillingInterval.Month }),
				createPrepaidPrice({ tierAmount: 10 }),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(true);
		});

		test("prepaid-only $50/unit to $20/mo + $10/unit prepaid = downgrade ($50 > $30)", () => {
			const prices1 = [createPrepaidPrice({ tierAmount: 50 })];
			const prices2 = [
				createFixedPrice({ amount: 20, interval: BillingInterval.Month }),
				createPrepaidPrice({ tierAmount: 10 }),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(false);
		});

		test("$20/mo + $10/unit prepaid to prepaid-only $50/unit = upgrade ($30 <= $50)", () => {
			const prices1 = [
				createFixedPrice({ amount: 20, interval: BillingInterval.Month }),
				createPrepaidPrice({ tierAmount: 10 }),
			];
			const prices2 = [createPrepaidPrice({ tierAmount: 50 })];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(true);
		});

		test("prepaid-only $5/unit to $20/mo + $10/unit prepaid = upgrade ($5 <= $30)", () => {
			const prices1 = [createPrepaidPrice({ tierAmount: 5 })];
			const prices2 = [
				createFixedPrice({ amount: 20, interval: BillingInterval.Month }),
				createPrepaidPrice({ tierAmount: 10 }),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(true);
		});
	});

	describe("products with allocated prices", () => {
		test("$20/mo + allocated to $50/mo + allocated = upgrade", () => {
			const prices1 = [
				createFixedPrice({ amount: 20, interval: BillingInterval.Month }),
				createAllocatedPrice({ tierAmount: 10 }),
			];
			const prices2 = [
				createFixedPrice({ amount: 50, interval: BillingInterval.Month }),
				createAllocatedPrice({ tierAmount: 10 }),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(true);
		});

		test("$50/mo + allocated to $20/mo + allocated = downgrade", () => {
			const prices1 = [
				createFixedPrice({ amount: 50, interval: BillingInterval.Month }),
				createAllocatedPrice({ tierAmount: 10 }),
			];
			const prices2 = [
				createFixedPrice({ amount: 20, interval: BillingInterval.Month }),
				createAllocatedPrice({ tierAmount: 10 }),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(false);
		});

		test("$200/yr + allocated to $20/mo + allocated = upgrade (normalized)", () => {
			const prices1 = [
				createFixedPrice({ amount: 200, interval: BillingInterval.Year }),
				createAllocatedPrice({ tierAmount: 10 }),
			];
			const prices2 = [
				createFixedPrice({ amount: 20, interval: BillingInterval.Month }),
				createAllocatedPrice({ tierAmount: 10 }),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(true);
		});

		test("allocated-only (no base) to $20/mo + allocated = upgrade", () => {
			const prices1 = [createAllocatedPrice({ tierAmount: 10 })];
			const prices2 = [
				createFixedPrice({ amount: 20, interval: BillingInterval.Month }),
				createAllocatedPrice({ tierAmount: 10 }),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(true);
		});

		test("$20/mo + allocated to allocated-only (no base) = downgrade", () => {
			const prices1 = [
				createFixedPrice({ amount: 20, interval: BillingInterval.Month }),
				createAllocatedPrice({ tierAmount: 10 }),
			];
			const prices2 = [createAllocatedPrice({ tierAmount: 10 })];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(false);
		});
	});

	describe("mixed price types (base + prepaid + allocated + consumable)", () => {
		test("$20/mo + all usage types to $50/mo + all usage types = upgrade", () => {
			const prices1 = [
				createFixedPrice({ amount: 20, interval: BillingInterval.Month }),
				createPrepaidPrice({ tierAmount: 10 }),
				createAllocatedPrice({ tierAmount: 10 }),
				createConsumablePrice({ tierAmount: 0.1 }),
			];
			const prices2 = [
				createFixedPrice({ amount: 50, interval: BillingInterval.Month }),
				createPrepaidPrice({ tierAmount: 5 }),
				createAllocatedPrice({ tierAmount: 20 }),
				createConsumablePrice({ tierAmount: 0.2 }),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(true);
		});

		test("$50/mo + cheap usage to $20/mo + expensive usage = upgrade (total $52 <= $220)", () => {
			const prices1 = [
				createFixedPrice({ amount: 50, interval: BillingInterval.Month }),
				createPrepaidPrice({ tierAmount: 1 }),
				createAllocatedPrice({ tierAmount: 1 }),
			];
			const prices2 = [
				createFixedPrice({ amount: 20, interval: BillingInterval.Month }),
				createPrepaidPrice({ tierAmount: 100 }),
				createAllocatedPrice({ tierAmount: 100 }),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(true);
		});

		test("$50/mo + expensive usage to $20/mo + cheap usage = downgrade (total $150 > $22)", () => {
			const prices1 = [
				createFixedPrice({ amount: 50, interval: BillingInterval.Month }),
				createPrepaidPrice({ tierAmount: 50 }),
				createAllocatedPrice({ tierAmount: 50 }),
			];
			const prices2 = [
				createFixedPrice({ amount: 20, interval: BillingInterval.Month }),
				createPrepaidPrice({ tierAmount: 1 }),
				createAllocatedPrice({ tierAmount: 1 }),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(false);
		});

		test("$200/yr + prepaid + allocated to $20/mo + consumable = downgrade (normalized $36.67 > $20)", () => {
			const prices1 = [
				createFixedPrice({ amount: 200, interval: BillingInterval.Year }),
				createPrepaidPrice({ tierAmount: 10 }),
				createAllocatedPrice({ tierAmount: 10 }),
			];
			const prices2 = [
				createFixedPrice({ amount: 20, interval: BillingInterval.Month }),
				createConsumablePrice({ tierAmount: 0.1 }),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(false);
		});

		test("$200/yr + small prepaid to $20/mo + consumable = upgrade (normalized $17.67 <= $20)", () => {
			const prices1 = [
				createFixedPrice({ amount: 200, interval: BillingInterval.Year }),
				createPrepaidPrice({ tierAmount: 1 }),
			];
			const prices2 = [
				createFixedPrice({ amount: 20, interval: BillingInterval.Month }),
				createConsumablePrice({ tierAmount: 0.1 }),
			];
			expect(isProductUpgrade({ prices1, prices2 })).toBe(true);
		});
	});
});
