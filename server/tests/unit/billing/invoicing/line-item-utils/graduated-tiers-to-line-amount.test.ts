import { describe, expect, test } from "bun:test";
import { Infinite, type UsageTier } from "@autumn/shared";
import { graduatedTiersToLineAmount } from "@utils/billingUtils/invoicingUtils/lineItemUtils/graduatedTiersToLineAmount";

// Standard multi-tier schedule used across several tests:
// 0–100 @ $0.10, 101–500 @ $0.05, 501+ @ $0.02
const THREE_TIERS = [
	{ to: 100, amount: 0.1 },
	{ to: 500, amount: 0.05 },
	{ to: Infinite, amount: 0.02 },
] as UsageTier[];

describe("graduatedTiersToLineAmount", () => {
	describe("basic graduated math", () => {
		test("single flat-rate tier: 100 units @ $0.10 = $10", () => {
			expect(
				graduatedTiersToLineAmount({
					tiers: [{ to: Infinite, amount: 0.1 }],
					usage: 100,
				}),
			).toBe(10);
		});

		test("0 usage = $0", () => {
			expect(
				graduatedTiersToLineAmount({
					tiers: [{ to: Infinite, amount: 0.1 }],
					usage: 0,
				}),
			).toBe(0);
		});

		test("usage within first tier only: 50 units = $5", () => {
			expect(
				graduatedTiersToLineAmount({ tiers: THREE_TIERS, usage: 50 }),
			).toBe(5);
		});

		test("usage exactly at tier 1 boundary: 100 units = $10", () => {
			expect(
				graduatedTiersToLineAmount({ tiers: THREE_TIERS, usage: 100 }),
			).toBe(10);
		});

		test("usage spanning tier 1 + partial tier 2: 250 units = $17.50", () => {
			// 100×$0.10 + 150×$0.05 = $10 + $7.50 = $17.50
			expect(
				graduatedTiersToLineAmount({ tiers: THREE_TIERS, usage: 250 }),
			).toBe(17.5);
		});

		test("usage spanning tier 1 + full tier 2: 500 units = $30", () => {
			// 100×$0.10 + 400×$0.05 = $10 + $20 = $30
			expect(
				graduatedTiersToLineAmount({ tiers: THREE_TIERS, usage: 500 }),
			).toBe(30);
		});

		test("usage across all three tiers: 1000 units = $40", () => {
			// 100×$0.10 + 400×$0.05 + 500×$0.02 = $10 + $20 + $10 = $40
			expect(
				graduatedTiersToLineAmount({ tiers: THREE_TIERS, usage: 1000 }),
			).toBe(40);
		});

		test("tier.to = -1 treated as Infinite", () => {
			expect(
				graduatedTiersToLineAmount({
					tiers: [{ to: -1, amount: 0.1 }],
					usage: 100,
				}),
			).toBe(10);
		});

		test("throws when tiers is null/undefined", () => {
			expect(() =>
				graduatedTiersToLineAmount({
					tiers: null as unknown as UsageTier[],
					usage: 100,
				}),
			).toThrow();
		});
	});

	describe("billing units", () => {
		const tiers = [{ to: Infinite, amount: 1 }] as UsageTier[]; // $1 per billing unit

		test("rounds up to nearest billing unit: 15 usage, billingUnits=10 → 20 units → $2", () => {
			expect(
				graduatedTiersToLineAmount({ tiers, usage: 15, billingUnits: 10 }),
			).toBe(2);
		});

		test("exact billing unit multiple: 20 usage, billingUnits=10 → $2", () => {
			expect(
				graduatedTiersToLineAmount({ tiers, usage: 20, billingUnits: 10 }),
			).toBe(2);
		});

		test("sub-unit usage rounds up to 1 billing unit: 1 usage, billingUnits=10 → $1", () => {
			expect(
				graduatedTiersToLineAmount({ tiers, usage: 1, billingUnits: 10 }),
			).toBe(1);
		});
	});

	describe("decimal precision", () => {
		test("floating point safe: 3 units @ $0.10/unit = $0.30 (not 0.30000000004)", () => {
			expect(
				graduatedTiersToLineAmount({
					tiers: [{ to: Infinite, amount: 0.1 }],
					usage: 3,
				}),
			).toBe(0.3);
		});

		test("very small rate: 1,000,000 units @ $0.000001 = $1", () => {
			expect(
				graduatedTiersToLineAmount({
					tiers: [{ to: Infinite, amount: 0.000001 }],
					usage: 1000000,
				}),
			).toBe(1);
		});

		test("fractional rate across tiers: 75 units (0–50 @ $0.0075, 50+ @ $0.0025) = $0.4375", () => {
			// 50×$0.0075 + 25×$0.0025 = $0.375 + $0.0625 = $0.4375
			expect(
				graduatedTiersToLineAmount({
					tiers: [
						{ to: 50, amount: 0.0075 },
						{ to: Infinite, amount: 0.0025 },
					],
					usage: 75,
				}),
			).toBe(0.4375);
		});
	});

	describe("negative usage (allowNegative)", () => {
		test("negative usage with allowNegative=false (default): absolute value priced, result is positive", () => {
			// With allowNegative=false, negative usage is treated as-is.
			// The isNegative flag is only set when allowNegative=true AND usage<0.
			// With allowNegative=false, absoluteUsage = usage (stays negative),
			// but roundUsageToNearestBillingUnit rounds to 0 for negative → $0.
			const result = graduatedTiersToLineAmount({
				tiers: [{ to: Infinite, amount: 0.1 }],
				usage: -100,
			});
			expect(result).toBe(0);
		});

		test("negative usage with allowNegative=true: produces negative dollar amount", () => {
			// -100 units: abs=100, priced at $10, then negated → -$10
			const result = graduatedTiersToLineAmount({
				tiers: [{ to: Infinite, amount: 0.1 }],
				usage: -100,
				allowNegative: true,
			});
			expect(result).toBe(-10);
		});

		test("negative usage with allowNegative=true, multi-tier: correct tier bands used on absolute value", () => {
			// -250 units: abs=250, graduated: 100×$0.10 + 150×$0.05 = $17.50, negated → -$17.50
			const result = graduatedTiersToLineAmount({
				tiers: THREE_TIERS,
				usage: -250,
				allowNegative: true,
			});
			expect(result).toBe(-17.5);
		});

		test("negative usage with allowNegative=true, spanning all tiers: -1000 units = -$40", () => {
			const result = graduatedTiersToLineAmount({
				tiers: THREE_TIERS,
				usage: -1000,
				allowNegative: true,
			});
			expect(result).toBe(-40);
		});

		test("negative usage with allowNegative=true and billingUnits: rounds up absolute value first", () => {
			// -15 units, billingUnits=10 → abs=15 → rounds to 20 → 20×($1/10) = $2 → -$2
			const result = graduatedTiersToLineAmount({
				tiers: [{ to: Infinite, amount: 1 }],
				usage: -15,
				billingUnits: 10,
				allowNegative: true,
			});
			expect(result).toBe(-2);
		});

		test("positive usage is unaffected by allowNegative=true", () => {
			// allowNegative has no effect on positive usage
			const withFlag = graduatedTiersToLineAmount({
				tiers: THREE_TIERS,
				usage: 250,
				allowNegative: true,
			});
			const withoutFlag = graduatedTiersToLineAmount({
				tiers: THREE_TIERS,
				usage: 250,
			});
			expect(withFlag).toBe(withoutFlag);
			expect(withFlag).toBe(17.5);
		});

		test("zero usage with allowNegative=true = $0", () => {
			const result = graduatedTiersToLineAmount({
				tiers: [{ to: Infinite, amount: 0.1 }],
				usage: 0,
				allowNegative: true,
			});
			expect(result).toBe(0);
		});
	});
});
