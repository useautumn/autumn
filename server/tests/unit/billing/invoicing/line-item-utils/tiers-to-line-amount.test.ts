import { describe, expect, test } from "bun:test";
import {
	Infinite,
	type Price,
	TierBehavior,
	tiersToLineAmount,
} from "@autumn/shared";

const createMockPrice = (
	tiers: { to: number | typeof Infinite; amount: number }[],
	tierBehaviour?: TierBehavior,
): Price =>
	({
		id: "test-price",
		internal_product_id: "test-product",
		tier_behavior: tierBehaviour,
		config: {
			type: "usage",
			usage_tiers: tiers,
		},
	}) as unknown as Price;

describe("tiersToLineAmount", () => {
	describe("graduated pricing", () => {
		describe("single tier (flat rate)", () => {
			test("100 overage @ $0.10/unit = $10", () => {
				const price = createMockPrice([{ to: Infinite, amount: 0.1 }]);
				const result = tiersToLineAmount({ price, overage: 100 });

				expect(result).toBe(10);
			});

			test("0 overage = $0", () => {
				const price = createMockPrice([{ to: Infinite, amount: 0.1 }]);
				const result = tiersToLineAmount({ price, overage: 0 });
				expect(result).toBe(0);
			});
		});

		describe("multiple tiers", () => {
			const tieredPrice = createMockPrice([
				{ to: 100, amount: 0.1 },
				{ to: 500, amount: 0.05 },
				{ to: Infinite, amount: 0.02 },
			]);

			test("50 overage (within tier 1) = $5", () => {
				const result = tiersToLineAmount({ price: tieredPrice, overage: 50 });
				expect(result).toBe(5);
			});

			test("100 overage (exactly tier 1) = $10", () => {
				const result = tiersToLineAmount({ price: tieredPrice, overage: 100 });
				expect(result).toBe(10);
			});

			test("250 overage (tier 1 + partial tier 2) = $17.50", () => {
				const result = tiersToLineAmount({ price: tieredPrice, overage: 250 });
				expect(result).toBe(17.5);
			});

			test("500 overage (tier 1 + full tier 2) = $30", () => {
				const result = tiersToLineAmount({ price: tieredPrice, overage: 500 });
				expect(result).toBe(30);
			});

			test("1000 overage (all tiers) = $40", () => {
				const result = tiersToLineAmount({
					price: tieredPrice,
					overage: 1000,
				});
				expect(result).toBe(40);
			});
		});

		describe("billing units", () => {
			const price = createMockPrice([{ to: Infinite, amount: 1 }]);

			test("rounds up to nearest billing unit (billingUnits=10)", () => {
				const result = tiersToLineAmount({
					price,
					overage: 15,
					billingUnits: 10,
				});
				expect(result).toBe(2);
			});

			test("exact billing unit multiple", () => {
				const result = tiersToLineAmount({
					price,
					overage: 20,
					billingUnits: 10,
				});
				expect(result).toBe(2);
			});

			test("small overage rounds up", () => {
				const result = tiersToLineAmount({
					price,
					overage: 1,
					billingUnits: 10,
				});
				expect(result).toBe(1);
			});
		});

		describe("decimal precision", () => {
			test("fractional rate: 7 overage @ $0.0033/unit", () => {
				const price = createMockPrice([{ to: Infinite, amount: 0.0033 }]);
				const result = tiersToLineAmount({ price, overage: 7 });
				expect(result).toBe(0.0231);
			});

			test("fractional rate with many decimals: 13 overage @ $0.00123/unit", () => {
				const price = createMockPrice([{ to: Infinite, amount: 0.00123 }]);
				const result = tiersToLineAmount({ price, overage: 13 });
				expect(result).toBe(0.01599);
			});

			test("large overage with small rate: 1000000 @ $0.000001/unit", () => {
				const price = createMockPrice([{ to: Infinite, amount: 0.000001 }]);
				const result = tiersToLineAmount({ price, overage: 1000000 });
				expect(result).toBe(1);
			});

			test("tiered with fractional rates", () => {
				const price = createMockPrice([
					{ to: 50, amount: 0.0075 },
					{ to: Infinite, amount: 0.0025 },
				]);
				const result = tiersToLineAmount({ price, overage: 75 });
				expect(result).toBe(0.4375);
			});

			test("very small overage with fractional rate: 3 @ $0.33/unit", () => {
				const price = createMockPrice([{ to: Infinite, amount: 0.33 }]);
				const result = tiersToLineAmount({ price, overage: 3 });
				expect(result).toBe(0.99);
			});

			test("floating point edge case: 0.1 + 0.2 precision", () => {
				const price = createMockPrice([{ to: Infinite, amount: 0.1 }]);
				const result = tiersToLineAmount({ price, overage: 3 });
				expect(result).toBe(0.3);
			});
		});

		describe("edge cases", () => {
			test("tier.to = -1 treated same as Infinite", () => {
				const price = createMockPrice([{ to: -1, amount: 0.1 }]);
				const result = tiersToLineAmount({ price, overage: 100 });
				expect(result).toBe(10);
			});

			test("throws if no tiers", () => {
				const price = { config: {} } as unknown as Price;
				expect(() => tiersToLineAmount({ price, overage: 100 })).toThrow();
			});
		});
	});

	describe("volume pricing", () => {
		const volumePrice = createMockPrice(
			[
				{ to: 100, amount: 0.1 },
				{ to: 500, amount: 0.05 },
				{ to: Infinite, amount: 0.02 },
			],
			TierBehavior.VolumeBased,
		);

		describe("tier selection", () => {
			test("50 units falls in tier 1 → entire 50 @ $0.10 = $5", () => {
				const result = tiersToLineAmount({ price: volumePrice, overage: 50 });
				expect(result).toBe(5);
			});

			test("100 units (exactly tier 1 boundary) → entire 100 @ $0.10 = $10", () => {
				const result = tiersToLineAmount({ price: volumePrice, overage: 100 });
				expect(result).toBe(10);
			});

			test("101 units (just into tier 2) → entire 101 @ $0.05 = $5.05", () => {
				const result = tiersToLineAmount({ price: volumePrice, overage: 101 });
				expect(result).toBe(5.05);
			});

			test("250 units (mid tier 2) → entire 250 @ $0.05 = $12.50", () => {
				const result = tiersToLineAmount({ price: volumePrice, overage: 250 });
				expect(result).toBe(12.5);
			});

			test("500 units (exactly tier 2 boundary) → entire 500 @ $0.05 = $25", () => {
				const result = tiersToLineAmount({ price: volumePrice, overage: 500 });
				expect(result).toBe(25);
			});

			test("1000 units (in tier 3) → entire 1000 @ $0.02 = $20", () => {
				const result = tiersToLineAmount({
					price: volumePrice,
					overage: 1000,
				});
				expect(result).toBe(20);
			});
		});

		describe("single tier (flat rate)", () => {
			test("100 units @ $0.10/unit = $10", () => {
				const price = createMockPrice(
					[{ to: Infinite, amount: 0.1 }],
					TierBehavior.VolumeBased,
				);
				const result = tiersToLineAmount({ price, overage: 100 });
				expect(result).toBe(10);
			});

			test("0 units = $0", () => {
				const price = createMockPrice(
					[{ to: Infinite, amount: 0.1 }],
					TierBehavior.VolumeBased,
				);
				const result = tiersToLineAmount({ price, overage: 0 });
				expect(result).toBe(0);
			});

			test("tier.to = -1 treated same as Infinite", () => {
				const price = createMockPrice(
					[{ to: -1, amount: 0.1 }],
					TierBehavior.VolumeBased,
				);
				const result = tiersToLineAmount({ price, overage: 100 });
				expect(result).toBe(10);
			});
		});

		describe("billing units", () => {
			const tokenPrice = createMockPrice(
				[
					{ to: 100000, amount: 1.0 },
					{ to: Infinite, amount: 0.5 },
				],
				TierBehavior.VolumeBased,
			);

			test("50k tokens (tier 1) @ $1/1k = $50", () => {
				const result = tiersToLineAmount({
					price: tokenPrice,
					overage: 50000,
					billingUnits: 1000,
				});
				expect(result).toBe(50);
			});

			test("150k tokens (tier 2) @ $0.50/1k = $75", () => {
				const result = tiersToLineAmount({
					price: tokenPrice,
					overage: 150000,
					billingUnits: 1000,
				});
				expect(result).toBe(75);
			});

			test("rounds up to nearest billing unit before pricing", () => {
				const result = tiersToLineAmount({
					price: tokenPrice,
					overage: 1500,
					billingUnits: 1000,
				});
				expect(result).toBe(2);
			});
		});

		describe("negative overage (credits)", () => {
			test("negative overage produces negative amount", () => {
				const result = tiersToLineAmount({
					price: volumePrice,
					overage: -250,
				});
				expect(result).toBe(-12.5);
			});

			test("negative overage in tier 1", () => {
				const result = tiersToLineAmount({
					price: volumePrice,
					overage: -50,
				});
				expect(result).toBe(-5);
			});
		});
	});
});
