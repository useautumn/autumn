import { describe, expect, test } from "bun:test";
import { Infinite, type UsageTier } from "@autumn/shared";
import { volumeTiersToLineAmount } from "@utils/billingUtils/invoicingUtils/lineItemUtils/volumeTiersToLineAmount";

// Standard multi-tier volume schedule used across several tests:
// 0–100 @ $0.10/unit, 101–500 @ $0.05/unit, 501+ @ $0.02/unit
// Volume: entire quantity is priced at the rate of whichever tier it falls into.
const THREE_TIERS = [
	{ to: 100, amount: 0.1 },
	{ to: 500, amount: 0.05 },
	{ to: Infinite, amount: 0.02 },
] as UsageTier[];

describe("volumeTiersToLineAmount", () => {
	describe("tier selection", () => {
		test("usage within tier 1: 50 units → entire 50 @ $0.10 = $5", () => {
			expect(volumeTiersToLineAmount({ tiers: THREE_TIERS, usage: 50 })).toBe(
				5,
			);
		});

		test("usage exactly at tier 1 boundary: 100 units → entire 100 @ $0.10 = $10", () => {
			expect(volumeTiersToLineAmount({ tiers: THREE_TIERS, usage: 100 })).toBe(
				10,
			);
		});

		test("usage just into tier 2: 101 units → entire 101 @ $0.05 = $5.05", () => {
			expect(volumeTiersToLineAmount({ tiers: THREE_TIERS, usage: 101 })).toBe(
				5.05,
			);
		});

		test("usage mid tier 2: 250 units → entire 250 @ $0.05 = $12.50 (not $17.50 graduated)", () => {
			// Graduated would be: 100×$0.10 + 150×$0.05 = $17.50
			// Volume charges entire quantity at tier 2 rate
			expect(volumeTiersToLineAmount({ tiers: THREE_TIERS, usage: 250 })).toBe(
				12.5,
			);
		});

		test("usage exactly at tier 2 boundary: 500 units → entire 500 @ $0.05 = $25", () => {
			expect(volumeTiersToLineAmount({ tiers: THREE_TIERS, usage: 500 })).toBe(
				25,
			);
		});

		test("usage in tier 3: 1000 units → entire 1000 @ $0.02 = $20 (not $40 graduated)", () => {
			// Graduated would be: 100×$0.10 + 400×$0.05 + 500×$0.02 = $40
			// Volume charges entire quantity at tier 3 rate
			expect(volumeTiersToLineAmount({ tiers: THREE_TIERS, usage: 1000 })).toBe(
				20,
			);
		});
	});

	describe("single tier (flat rate)", () => {
		test("100 units @ $0.10 = $10", () => {
			expect(
				volumeTiersToLineAmount({
					tiers: [{ to: Infinite, amount: 0.1 }],
					usage: 100,
				}),
			).toBe(10);
		});

		test("0 usage = $0", () => {
			expect(
				volumeTiersToLineAmount({
					tiers: [{ to: Infinite, amount: 0.1 }],
					usage: 0,
				}),
			).toBe(0);
		});

		test("tier.to = -1 treated as Infinite", () => {
			expect(
				volumeTiersToLineAmount({
					tiers: [{ to: -1, amount: 0.1 }],
					usage: 100,
				}),
			).toBe(10);
		});
	});

	describe("billing units", () => {
		// $1.00 per 1000 tokens; tier boundary at 100k tokens
		const TOKEN_TIERS = [
			{ to: 100000, amount: 1.0 },
			{ to: Infinite, amount: 0.5 },
		] as UsageTier[];

		test("50k tokens (tier 1) @ $1/1k = $50", () => {
			expect(
				volumeTiersToLineAmount({
					tiers: TOKEN_TIERS,
					usage: 50000,
					billingUnits: 1000,
				}),
			).toBe(50);
		});

		test("150k tokens (tier 2) @ $0.50/1k = $75", () => {
			expect(
				volumeTiersToLineAmount({
					tiers: TOKEN_TIERS,
					usage: 150000,
					billingUnits: 1000,
				}),
			).toBe(75);
		});

		test("rounds up to nearest billing unit before selecting tier: 1500 tokens → 2000 → tier 1 → $2", () => {
			// 1500 tokens rounds up to 2000 (nearest 1000), still in tier 1
			expect(
				volumeTiersToLineAmount({
					tiers: TOKEN_TIERS,
					usage: 1500,
					billingUnits: 1000,
				}),
			).toBe(2);
		});

		test("rounding can push usage into higher tier: 99500 tokens → 100000 → stays tier 1 boundary", () => {
			// 99500 rounds up to 100000 which is exactly at tier 1 boundary → tier 1 rate
			expect(
				volumeTiersToLineAmount({
					tiers: TOKEN_TIERS,
					usage: 99500,
					billingUnits: 1000,
				}),
			).toBe(100);
		});
	});

	describe("decimal precision", () => {
		test("fractional rate: 3 units @ $0.10/unit = $0.30 (not 0.30000000004)", () => {
			expect(
				volumeTiersToLineAmount({
					tiers: [{ to: Infinite, amount: 0.1 }],
					usage: 3,
				}),
			).toBe(0.3);
		});

		test("large usage, tiny rate: 1,000,000 units @ $0.000001 = $1", () => {
			expect(
				volumeTiersToLineAmount({
					tiers: [{ to: Infinite, amount: 0.000001 }],
					usage: 1_000_000,
				}),
			).toBe(1);
		});
	});

	describe("negative usage (allowNegative)", () => {
		test("negative usage with allowNegative=false (default): rounds abs to 0 → $0", () => {
			// Without allowNegative, negative usage is treated as-is.
			// roundUsageToNearestBillingUnit of a negative number returns 0.
			const result = volumeTiersToLineAmount({
				tiers: THREE_TIERS,
				usage: -100,
			});
			expect(result).toBe(0);
		});

		test("negative usage with allowNegative=true: abs value is priced then negated", () => {
			// -250 units: abs=250, falls in tier 2 → 250×$0.05=$12.50, negated → -$12.50
			const result = volumeTiersToLineAmount({
				tiers: THREE_TIERS,
				usage: -250,
				allowNegative: true,
			});
			expect(result).toBe(-12.5);
		});

		test("negative usage with allowNegative=true, tier 1: -50 units → -$5", () => {
			const result = volumeTiersToLineAmount({
				tiers: THREE_TIERS,
				usage: -50,
				allowNegative: true,
			});
			expect(result).toBe(-5);
		});

		test("negative usage with allowNegative=true, tier 3: -1000 units → -$20", () => {
			const result = volumeTiersToLineAmount({
				tiers: THREE_TIERS,
				usage: -1000,
				allowNegative: true,
			});
			expect(result).toBe(-20);
		});

		test("negative usage with allowNegative=true and billingUnits: rounds abs up first", () => {
			// -1500 tokens: abs=1500, billingUnits=1000 → rounds to 2000 → tier 1 → 2000×($1/1000)=$2 → -$2
			expect(
				volumeTiersToLineAmount({
					tiers: [
						{ to: 100000, amount: 1.0 },
						{ to: Infinite, amount: 0.5 },
					],
					usage: -1500,
					billingUnits: 1000,
					allowNegative: true,
				}),
			).toBe(-2);
		});

		test("positive usage is unaffected by allowNegative=true", () => {
			const withFlag = volumeTiersToLineAmount({
				tiers: THREE_TIERS,
				usage: 250,
				allowNegative: true,
			});
			const withoutFlag = volumeTiersToLineAmount({
				tiers: THREE_TIERS,
				usage: 250,
			});
			expect(withFlag).toBe(withoutFlag);
			expect(withFlag).toBe(12.5);
		});

		test("zero usage with allowNegative=true = $0", () => {
			expect(
				volumeTiersToLineAmount({
					tiers: THREE_TIERS,
					usage: 0,
					allowNegative: true,
				}),
			).toBe(0);
		});
	});

	describe("allowance (free tier prepended)", () => {
		// With allowance=50, tiers become:
		// [{to:50, amt:0}, {to:150, amt:0.10}, {to:550, amt:0.05}, {to:Inf, amt:0.02}]
		// Volume: entire usage charged at whichever tier it falls into.

		test("usage below allowance → $0 (falls in free tier)", () => {
			expect(
				volumeTiersToLineAmount({
					tiers: THREE_TIERS,
					usage: 30,
					allowance: 50,
				}),
			).toBe(0);
		});

		test("usage exactly at allowance → $0 (boundary of free tier)", () => {
			expect(
				volumeTiersToLineAmount({
					tiers: THREE_TIERS,
					usage: 50,
					allowance: 50,
				}),
			).toBe(0);
		});

		test("usage just above allowance → falls in shifted tier 1: 51 @ $0.10 = $5.10", () => {
			// Tiers with allowance=50: [{to:50,$0}, {to:150,$0.10}, ...]
			// 51 > 50, 51 <= 150 → entire 51 × $0.10
			expect(
				volumeTiersToLineAmount({
					tiers: THREE_TIERS,
					usage: 51,
					allowance: 50,
				}),
			).toBe(5.1);
		});

		test("usage in shifted tier 1: 120 @ $0.10 = $12 (includes free portion)", () => {
			// 120 > 50, 120 <= 150 → entire 120 × $0.10
			expect(
				volumeTiersToLineAmount({
					tiers: THREE_TIERS,
					usage: 120,
					allowance: 50,
				}),
			).toBe(12);
		});

		test("usage in shifted tier 2: 200 @ $0.05 = $10", () => {
			// 200 > 50, > 150, 200 <= 550 → entire 200 × $0.05
			expect(
				volumeTiersToLineAmount({
					tiers: THREE_TIERS,
					usage: 200,
					allowance: 50,
				}),
			).toBe(10);
		});

		test("usage in shifted tier 3: 600 @ $0.02 = $12", () => {
			// 600 > 50, > 150, > 550 → entire 600 × $0.02
			expect(
				volumeTiersToLineAmount({
					tiers: THREE_TIERS,
					usage: 600,
					allowance: 50,
				}),
			).toBe(12);
		});

		test("allowance with billingUnits: usage below allowance rounds up but stays in free tier → $0", () => {
			// Tiers: [{to:500, $10}, {to:Inf, $5}], allowance=100, billingUnits=100
			// Tiers with allowance: [{to:100,$0}, {to:600,$10}, {to:Inf,$5}]
			// Usage 50 rounds up to 100, 100 <= 100 → free tier → $0
			expect(
				volumeTiersToLineAmount({
					tiers: [
						{ to: 500, amount: 10 },
						{ to: Infinite, amount: 5 },
					],
					usage: 50,
					allowance: 100,
					billingUnits: 100,
				}),
			).toBe(0);
		});

		test("allowance with billingUnits: usage above allowance → paid tier", () => {
			// Tiers with allowance=100: [{to:100,$0}, {to:600,$10}, {to:Inf,$5}]
			// Usage 300, billingUnits=100 → rounded=300, 300 > 100, 300 <= 600
			// → 10/100 * 300 = $30
			expect(
				volumeTiersToLineAmount({
					tiers: [
						{ to: 500, amount: 10 },
						{ to: Infinite, amount: 5 },
					],
					usage: 300,
					allowance: 100,
					billingUnits: 100,
				}),
			).toBe(30);
		});

		test("allowance=0 behaves identically to no allowance", () => {
			const withZero = volumeTiersToLineAmount({
				tiers: THREE_TIERS,
				usage: 250,
				allowance: 0,
			});
			const withoutAllowance = volumeTiersToLineAmount({
				tiers: THREE_TIERS,
				usage: 250,
			});
			expect(withZero).toBe(withoutAllowance);
			expect(withZero).toBe(12.5);
		});
	});

	describe("throws on bad input", () => {
		test("throws when tiers is null/undefined", () => {
			expect(() =>
				volumeTiersToLineAmount({
					tiers: null as unknown as UsageTier[],
					usage: 100,
				}),
			).toThrow();
		});
	});
});
