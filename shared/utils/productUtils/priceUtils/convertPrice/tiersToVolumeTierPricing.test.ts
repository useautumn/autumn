import { describe, expect, test } from "bun:test";
import { tiersToVolumeTierPricing } from "./tiersToVolumeTierPricing";

describe("tiersToVolumeTierPricing", () => {
	test("classifies per-unit, flat-only and mixed tiers", () => {
		expect(
			tiersToVolumeTierPricing({ tiers: [{ amount: 1 }, { amount: 0.5 }] }),
		).toBe("per_unit");
		expect(
			tiersToVolumeTierPricing({
				tiers: [
					{ amount: 0, flat_amount: 10 },
					{ amount: 0, flat_amount: 20 },
				],
			}),
		).toBe("flat_fee");
		expect(
			tiersToVolumeTierPricing({
				tiers: [{ amount: 1, flat_amount: 10 }, { amount: 0.5 }],
			}),
		).toBe("per_unit_and_flat_fee");
	});
});
